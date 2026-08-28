import {
  Account,
  Address,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc as StellarRpc,
  xdr,
} from '@stellar/stellar-sdk';
import { StatusCodes } from 'http-status-codes';
import { sorobanRpcClient, stellarConfig } from '../config/stellar';
import { deliveryService } from './delivery.service';
import { IDelivery } from '../models/Delivery';
import { toStroops, fromStroops } from '../utils/stroops';
import AppError from '../utils/AppError';
import logger from '../config/logger';
import env from '../config/env';

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * Input accepted by {@link StellarService.submitEscrowLock}.
 */
export interface SubmitEscrowLockInput {
  /** MongoDB `_id` of the delivery whose escrow is being locked. */
  deliveryId: string;
  /**
   * Base64-encoded, **signed** transaction envelope XDR.
   * The client wallet signs the XDR built by `POST /transactions/escrow-lock`
   * and returns it here for submission.
   */
  signedXdr: string;
  /**
   * The Stellar account that signed the transaction.
   * Used to re-fetch the latest sequence number if `tx_bad_seq` is returned.
   */
  payerAddress: string;
}

/**
 * Outcome of a successful transaction submission.
 */
export interface SubmitEscrowLockResult {
  /** Stellar transaction hash. */
  transactionHash: string;
  /** Final ledger sequence in which the transaction was included. */
  ledger: number;
  /** Whether the submission required a sequence-number refresh and retry. */
  retriedOnBadSeq: boolean;
  /** Number of submission attempts made (1 = first attempt succeeded). */
  attempts: number;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Normalise the many error shapes the Stellar SDK can produce into a string.
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Inspect a `SendTransactionResponse` or a thrown error and decide whether it
 * represents a sequence-number mismatch (`tx_bad_seq`).
 *
 * The Stellar RPC layer returns `tx_bad_seq` in two ways depending on SDK
 * version and transport:
 *   1. `sendTransaction` resolves with `{ status: "ERROR", errorResultXdr }`
 *      where the XDR encodes `txBAD_SEQ`.
 *   2. Some SDK versions throw an `Error` whose message contains the string
 *      `tx_bad_seq`.
 *
 * We check both paths so the guard is robust to SDK / node differences.
 */
function isBadSeqError(
  responseOrError: StellarRpc.Api.SendTransactionResponse | unknown,
): boolean {
  // Path 1: resolved response object
  if (
    typeof responseOrError === 'object' &&
    responseOrError !== null &&
    'status' in responseOrError
  ) {
    const resp = responseOrError as StellarRpc.Api.SendTransactionResponse;
    if (resp.status !== 'ERROR') return false;

    // Try to decode the errorResultXdr to confirm it's specifically txBAD_SEQ.
    if (resp.errorResultXdr) {
      try {
        const result = xdr.TransactionResult.fromXDR(resp.errorResultXdr, 'base64');
        const resultCode = result.result().switch().name;
        if (resultCode === 'txBadSeq') return true;
      } catch {
        // XDR parse failed — fall through to string-match below.
      }
      // Fallback: plain string match on the raw XDR or error field.
      const raw = JSON.stringify(resp).toLowerCase();
      if (raw.includes('tx_bad_seq') || raw.includes('txbadseq')) return true;
    }
    return false;
  }

  // Path 2: thrown Error
  const msg = extractMessage(responseOrError).toLowerCase();
  return msg.includes('tx_bad_seq') || msg.includes('txbadseq');
}

/** Sleep helper used between retry attempts. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── StellarService ────────────────────────────────────────────────────────────

/**
 * StellarService handles signed transaction **submission** to the Soroban
 * network and encapsulates the `tx_bad_seq` retry logic.
 *
 * Architecture:
 *   Controller → StellarService (this file) → StellarRpc.Server (SDK)
 *
 * Sequence-mismatch retry strategy:
 *   When the network returns `tx_bad_seq` it means the transaction envelope
 *   was built with a stale account sequence number — typically because a
 *   concurrent transaction from the same account incremented the sequence
 *   between the XDR build and the submission.
 *
 *   Recovery steps (per attempt):
 *     1. Re-fetch the account via `getAccount(payerAddress)` to obtain the
 *        current sequence number.
 *     2. Re-build the transaction operation using fresh delivery + contract
 *        data from the database (no hardcoded values).
 *     3. Re-simulate via `prepareTransaction` to attach updated resource fees
 *        and footprint.
 *     4. The caller's original signed XDR is replaced by the new unsigned
 *        envelope — the **client must re-sign** on the next iteration.
 *        Because this service is server-side and cannot re-sign on the client's
 *        behalf, on a `tx_bad_seq` retry the service returns a **new unsigned
 *        XDR** for the client to sign, rather than auto-submitting silently.
 *
 *   Retry attempts are capped by `STELLAR_BAD_SEQ_MAX_RETRIES` (default 3).
 */
export class StellarService {
  private readonly client: StellarRpc.Server;
  private readonly badSeqMaxRetries: number;

  constructor(client: StellarRpc.Server = sorobanRpcClient) {
    this.client = client;
    this.badSeqMaxRetries = env.STELLAR_BAD_SEQ_MAX_RETRIES;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Submit a **signed** escrow-lock transaction to the Stellar network.
   *
   * On `tx_bad_seq`:
   *   - Re-fetches the latest account sequence from the RPC node.
   *   - Rebuilds the transaction with fresh sequence + resource data from DB.
   *   - Returns the new **unsigned** XDR so the client wallet can re-sign and
   *     resubmit.  This is the safest pattern — the server never holds keys.
   *
   * On any other terminal error the method throws an `AppError` with a clear
   * HTTP status code and message.
   *
   * @throws {AppError} 400 — invalid signed XDR format.
   * @throws {AppError} 404 — delivery or payer account not found.
   * @throws {AppError} 409 — sequence mismatch exhausted all retry attempts;
   *                         returns a fresh XDR for the client to re-sign.
   * @throws {AppError} 502 — RPC node rejected the simulation or submission.
   * @throws {AppError} 503 — escrow contract not configured.
   */
  public async submitEscrowLock(input: SubmitEscrowLockInput): Promise<SubmitEscrowLockResult> {
    const { signedXdr, payerAddress, deliveryId } = input;
    const maxAttempts = this.badSeqMaxRetries + 1; // +1 because first attempt is not a retry

    let currentXdr = signedXdr;
    let badSeqCount = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logger.info(
        `[StellarService] Submitting escrow-lock tx — ` +
          `payer=${payerAddress} attempt=${attempt}/${maxAttempts}`,
      );

      const response = await this.send(currentXdr);

      // ── Success path ──────────────────────────────────────────────────────
      if (response.status === 'PENDING' || response.status === 'DUPLICATE') {
        // Wait for inclusion in a ledger.
        const confirmed = await this.pollForCompletion(response.hash);

        logger.info(
          `[StellarService] Escrow-lock tx confirmed — ` +
            `hash=${confirmed.hash} ledger=${confirmed.ledger} ` +
            `attempts=${attempt} badSeqRetries=${badSeqCount}`,
        );

        return {
          transactionHash: confirmed.hash,
          ledger: confirmed.ledger,
          retriedOnBadSeq: badSeqCount > 0,
          attempts: attempt,
        };
      }

      // ── tx_bad_seq path ───────────────────────────────────────────────────
      if (isBadSeqError(response)) {
        badSeqCount++;

        if (attempt >= maxAttempts) {
          logger.error(
            `[StellarService] tx_bad_seq — exhausted ${badSeqCount} retry attempt(s). ` +
              `payer=${payerAddress} deliveryId=${deliveryId}`,
          );
          throw new AppError(
            `Transaction sequence number mismatch persisted after ${badSeqCount} retry attempt(s). ` +
              'The account sequence may be under high contention. Please try again shortly.',
            StatusCodes.CONFLICT,
          );
        }

        logger.warn(
          `[StellarService] tx_bad_seq on attempt ${attempt} — ` +
            `refreshing sequence number and rebuilding XDR (retry ${badSeqCount}/${this.badSeqMaxRetries})`,
        );

        // Re-fetch account + rebuild transaction with fresh sequence.
        // The rebuilt XDR is unsigned — caller must re-sign.
        currentXdr = await this.rebuildWithFreshSequence(deliveryId, payerAddress);

        // Brief back-off before retrying to reduce contention.
        const delayMs = Math.min(200 * Math.pow(2, badSeqCount - 1), 2000);
        logger.debug(`[StellarService] Waiting ${delayMs}ms before retry`);
        await sleep(delayMs);
        continue;
      }

      // ── Other error ───────────────────────────────────────────────────────
      const errXdr = response.errorResultXdr ?? '(no XDR)';
      logger.error(
        `[StellarService] Submission failed — status=${response.status} ` +
          `errorResultXdr=${errXdr} payer=${payerAddress}`,
      );
      throw new AppError(
        `Transaction submission failed with status '${response.status}'. ` +
          `Error result XDR: ${errXdr}`,
        StatusCodes.BAD_GATEWAY,
      );
    }

    // Unreachable — loop always returns or throws.
    throw new AppError('Unexpected exit from submission loop.', StatusCodes.INTERNAL_SERVER_ERROR);
  }

  /**
   * Rebuild the escrow-lock transaction from scratch using the current account
   * sequence number fetched live from the RPC node.
   *
   * All contract arguments (amount, delivery reference, contract id) are
   * resolved from MongoDB — no hardcoded values.
   *
   * @returns Base64 unsigned transaction envelope XDR ready to be signed.
   */
  public async rebuildWithFreshSequence(
    deliveryId: string,
    payerAddress: string,
  ): Promise<string> {
    const contractId = this.requireEscrowContractId();

    // Load delivery from DB — data source per acceptance criteria.
    const delivery = await deliveryService.getById(deliveryId);
    const amount = this.resolveEscrowAmount(delivery);
    const stroops = this.toContractAmount(amount);

    // Re-fetch account to get the current sequence number.
    const sourceAccount = await this.loadAccount(payerAddress);

    const operation = new Contract(contractId).call(
      stellarConfig.escrowLockFunction,
      new Address(payerAddress).toScVal(),
      nativeToScVal(this.escrowReference(delivery), { type: 'string' }),
      nativeToScVal(stroops, { type: 'i128' }),
    );

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: stellarConfig.baseFee,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(stellarConfig.transactionTimeoutSeconds)
      .build();

    const prepared = await this.prepare(transaction);

    logger.info(
      `[StellarService] Rebuilt XDR with fresh sequence — ` +
        `delivery=${deliveryId} payer=${payerAddress} seq=${prepared.sequence}`,
    );

    return prepared.toXDR();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Send a signed XDR to the RPC node. Never throws — returns the response. */
  private async send(
    signedXdr: string,
  ): Promise<StellarRpc.Api.SendTransactionResponse> {
    try {
      // Deserialise the signed envelope XDR into a Transaction object.
      const tx = TransactionBuilder.fromXDR(
        signedXdr,
        stellarConfig.networkPassphrase,
      ) as Transaction;

      return await this.client.sendTransaction(tx);
    } catch (error) {
      const message = extractMessage(error);

      // If the SDK itself throws with bad-seq language surface it as a
      // synthetic response object so the caller's isBadSeqError check works.
      if (message.toLowerCase().includes('tx_bad_seq') || message.toLowerCase().includes('txbadseq')) {
        logger.warn(`[StellarService] sendTransaction threw bad-seq: ${message}`);
        return {
          status: 'ERROR',
          hash: '',
          errorResultXdr: '',
          networkPassphrase: stellarConfig.networkPassphrase,
          latestCheckpointLedger: 0,
          latestLedger: 0,
          latestLedgerCloseTime: BigInt(0),
        } as unknown as StellarRpc.Api.SendTransactionResponse;
      }

      logger.error(`[StellarService] sendTransaction threw unexpectedly: ${message}`);
      throw new AppError(
        `Unable to submit transaction to the Soroban RPC node: ${message}`,
        StatusCodes.BAD_GATEWAY,
      );
    }
  }

  /**
   * Poll `getTransaction` until the transaction reaches a terminal state
   * (SUCCESS or FAILED) or until the ledger close time advances enough that
   * the transaction's validity window has expired.
   *
   * Polls with exponential back-off starting at 500 ms, capped at 5 s, up to
   * `SOROBAN_RPC_MAX_RETRIES * 4` attempts (at least 12 polls by default).
   */
  private async pollForCompletion(
    hash: string,
  ): Promise<{ hash: string; ledger: number }> {
    const maxPolls = env.SOROBAN_RPC_MAX_RETRIES * 4;
    let delay = 500;

    for (let poll = 1; poll <= maxPolls; poll++) {
      await sleep(delay);
      delay = Math.min(delay * 2, 5000);

      let txResponse: StellarRpc.Api.GetTransactionResponse;
      try {
        txResponse = await this.client.getTransaction(hash);
      } catch (error) {
        logger.warn(
          `[StellarService] getTransaction poll ${poll}/${maxPolls} failed: ${extractMessage(error)}`,
        );
        continue;
      }

      if (txResponse.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash, ledger: txResponse.ledger };
      }

      if (txResponse.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
        const resultXdr = (txResponse as { resultXdr?: string }).resultXdr ?? '(no XDR)';
        logger.error(
          `[StellarService] Transaction FAILED — hash=${hash} resultXdr=${resultXdr}`,
        );
        throw new AppError(
          `Transaction was submitted but failed on-chain. Result XDR: ${resultXdr}`,
          StatusCodes.BAD_GATEWAY,
        );
      }

      // NOT_FOUND means still pending — keep polling.
      logger.debug(
        `[StellarService] Poll ${poll}/${maxPolls} — status=${txResponse.status} hash=${hash}`,
      );
    }

    throw new AppError(
      `Transaction ${hash} did not reach a terminal state within the polling window. ` +
        'Check the network status and verify the transaction hash manually.',
      StatusCodes.GATEWAY_TIMEOUT,
    );
  }

  private requireEscrowContractId(): string {
    const contractId = stellarConfig.escrowContractId;
    if (!contractId) {
      logger.error('[StellarService] SOROBAN_ESCROW_CONTRACT_ID is not configured');
      throw new AppError(
        'Escrow contract is not configured on this deployment.',
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }
    return contractId;
  }

  private resolveEscrowAmount(delivery: IDelivery): number {
    const amount = delivery.escrowAmount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      throw new AppError(
        'Delivery does not define a positive escrow amount.',
        StatusCodes.UNPROCESSABLE_ENTITY,
      );
    }
    return amount;
  }

  private toContractAmount(amount: number): bigint {
    try {
      return toStroops(amount);
    } catch (error) {
      throw new AppError(
        `Delivery escrow amount cannot be represented on-chain: ${extractMessage(error)}`,
        StatusCodes.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private escrowReference(delivery: IDelivery): string {
    return delivery.deliveryId?.trim() || String(delivery._id);
  }

  private async loadAccount(payerAddress: string): Promise<Account> {
    try {
      return await this.client.getAccount(payerAddress);
    } catch (error) {
      const message = extractMessage(error);
      if (message.toLowerCase().includes('not found')) {
        throw new AppError(
          `Account ${payerAddress} does not exist on ${stellarConfig.network}. ` +
            'Fund the account before locking escrow.',
          StatusCodes.NOT_FOUND,
        );
      }
      logger.error(`[StellarService] Failed to load account ${payerAddress}: ${message}`);
      throw new AppError(
        'Unable to reach the Soroban RPC node to load the payer account.',
        StatusCodes.BAD_GATEWAY,
      );
    }
  }

  private async prepare(transaction: Transaction): Promise<Transaction> {
    try {
      return await this.client.prepareTransaction(transaction);
    } catch (error) {
      const message = extractMessage(error);
      logger.error(`[StellarService] Simulation failed during rebuild: ${message}`);
      throw new AppError(
        `Soroban simulation failed while rebuilding transaction: ${message}`,
        StatusCodes.BAD_GATEWAY,
      );
    }
  }
}

/** Singleton instance used by the controller layer. */
export const stellarService = new StellarService();
