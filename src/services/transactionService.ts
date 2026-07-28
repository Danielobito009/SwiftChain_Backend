import {
  Account,
  Address,
  Contract,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc as StellarRpc,
} from '@stellar/stellar-sdk';
import { StatusCodes } from 'http-status-codes';
import { sorobanRpcClient, stellarConfig } from '../config/stellar';
import { deliveryService } from './delivery.service';
import { DeliveryStatus, IDelivery } from '../models/Delivery';
import { fromStroops, toStroops } from '../utils/stroops';
import AppError from '../utils/AppError';
import logger from '../config/logger';

/** Input accepted by {@link TransactionService.buildEscrowLockXdr}. */
export interface EscrowLockXdrInput {
  /** MongoDB `_id` of the delivery whose escrow is being locked. */
  deliveryId: string;
  /** Stellar account (`G...`) that will fund and sign the transaction. */
  payerAddress: string;
}

/** Unsigned transaction envelope returned to the client wallet. */
export interface EscrowLockXdrResult {
  /** Base64-encoded, simulation-prepared transaction envelope XDR. */
  xdr: string;
  network: string;
  networkPassphrase: string;
  contractId: string;
  contractFunction: string;
  sourceAccount: string;
  /** Sequence number consumed by this transaction. */
  sequence: string;
  /** Total fee (base fee + Soroban resource fee) in stroops. */
  fee: string;
  /** Unix timestamp (seconds) after which the envelope is no longer valid. */
  validUntil: number;
  delivery: {
    id: string;
    deliveryId?: string;
    trackingNumber?: string;
    status: DeliveryStatus;
  };
  amount: {
    /** Escrow amount as stored on the delivery document. */
    value: number;
    /** Same amount expressed in stroops (the contract's `i128` argument). */
    stroops: string;
    /** Fixed-point rendering of `stroops`, useful for display. */
    formatted: string;
  };
}

/**
 * Normalise the many error shapes the Stellar SDK can reject with (Error,
 * `{ code, message }` JSON-RPC payloads, plain strings) into a message.
 */
function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }

  return String(error);
}

/** Delivery states for which locking new escrow funds makes no sense. */
const NON_LOCKABLE_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  DeliveryStatus.COMPLETED,
  DeliveryStatus.CANCELLED,
]);

/**
 * TransactionService builds unsigned Soroban transactions on behalf of the
 * frontend. The backend never holds user secret keys: it only proposes a
 * contract invocation, which the client wallet (Freighter, Albedo, …) signs
 * and submits itself.
 */
export class TransactionService {
  private readonly client: StellarRpc.Server;

  constructor(client: StellarRpc.Server = sorobanRpcClient) {
    this.client = client;
  }

  /**
   * Build an unsigned XDR for the escrow-lock contract invocation of a
   * delivery.
   *
   * All contract arguments are derived from persisted state: the delivery and
   * its escrow amount are read from MongoDB, and the contract id/function come
   * from the deployment configuration. The transaction is simulated against
   * the configured Soroban RPC node so the returned envelope already carries
   * the correct footprint, resource fees and auth entries.
   *
   * @param input - Delivery id and the payer's Stellar account.
   * @returns       The base64 envelope XDR plus the context needed to display
   *                a signing prompt.
   * @throws  {AppError} 503 when the escrow contract id is not configured.
   * @throws  {AppError} 404 when the delivery or the payer account is unknown.
   * @throws  {AppError} 409 when the delivery is already completed/cancelled.
   * @throws  {AppError} 422 when the delivery carries no usable escrow amount.
   * @throws  {AppError} 502 when the RPC node rejects the simulation.
   */
  public async buildEscrowLockXdr(input: EscrowLockXdrInput): Promise<EscrowLockXdrResult> {
    const contractId = this.requireEscrowContractId();
    const delivery = await deliveryService.getById(input.deliveryId);

    this.assertLockable(delivery);
    const amount = this.resolveEscrowAmount(delivery);
    const stroops = this.toContractAmount(amount);

    const sourceAccount = await this.loadAccount(input.payerAddress);

    const operation = new Contract(contractId).call(
      stellarConfig.escrowLockFunction,
      new Address(input.payerAddress).toScVal(),
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
      `[TransactionService] Escrow-lock XDR built — delivery=${String(delivery._id)} ` +
        `payer=${input.payerAddress} amount=${amount} stroops=${stroops.toString()} ` +
        `fee=${prepared.fee}`,
    );

    return {
      xdr: prepared.toXDR(),
      network: stellarConfig.network,
      networkPassphrase: stellarConfig.networkPassphrase,
      contractId,
      contractFunction: stellarConfig.escrowLockFunction,
      sourceAccount: input.payerAddress,
      sequence: prepared.sequence,
      fee: prepared.fee,
      validUntil: Number(prepared.timeBounds?.maxTime ?? 0),
      delivery: {
        id: String(delivery._id),
        deliveryId: delivery.deliveryId,
        trackingNumber: delivery.trackingNumber,
        status: delivery.status,
      },
      amount: {
        value: amount,
        stroops: stroops.toString(),
        formatted: fromStroops(stroops),
      },
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  /** Ensure the deployment is configured with an escrow contract id. */
  private requireEscrowContractId(): string {
    const contractId = stellarConfig.escrowContractId;

    if (!contractId) {
      logger.error('[TransactionService] SOROBAN_ESCROW_CONTRACT_ID is not configured');
      throw new AppError(
        'Escrow contract is not configured on this deployment.',
        StatusCodes.SERVICE_UNAVAILABLE,
      );
    }

    return contractId;
  }

  /** Reject deliveries whose lifecycle has already moved past locking. */
  private assertLockable(delivery: IDelivery): void {
    if (NON_LOCKABLE_STATUSES.has(delivery.status)) {
      throw new AppError(
        `Escrow cannot be locked for a delivery with status '${delivery.status}'.`,
        StatusCodes.CONFLICT,
      );
    }
  }

  /** Read the escrow amount from the delivery document. */
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

  /** Convert the stored decimal amount into the contract's `i128` stroop value. */
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

  /**
   * Stable on-chain reference for the escrow, preferring the business
   * `deliveryId` and falling back to the document id.
   */
  private escrowReference(delivery: IDelivery): string {
    return delivery.deliveryId?.trim() || String(delivery._id);
  }

  /** Load the payer account (and its current sequence number) from the network. */
  private async loadAccount(payerAddress: string): Promise<Account> {
    try {
      return await this.client.getAccount(payerAddress);
    } catch (error) {
      // `rpc.Server.getAccount` rejects with a plain `{ code, message }` object
      // (not an Error) when the account is missing, so normalise both shapes.
      const message = extractMessage(error);

      if (message.toLowerCase().includes('not found')) {
        throw new AppError(
          `Account ${payerAddress} does not exist on ${stellarConfig.network}. ` +
            'Fund the account before locking escrow.',
          StatusCodes.NOT_FOUND,
        );
      }

      logger.error(`[TransactionService] Failed to load account ${payerAddress}: ${message}`);
      throw new AppError(
        'Unable to reach the Soroban RPC node to load the payer account.',
        StatusCodes.BAD_GATEWAY,
      );
    }
  }

  /** Simulate and assemble the transaction so the envelope is submit-ready. */
  private async prepare(transaction: Transaction): Promise<Transaction> {
    try {
      return await this.client.prepareTransaction(transaction);
    } catch (error) {
      const message = extractMessage(error);
      logger.error(`[TransactionService] Escrow-lock simulation failed: ${message}`);

      throw new AppError(
        `Soroban simulation failed for the escrow-lock invocation: ${message}`,
        StatusCodes.BAD_GATEWAY,
      );
    }
  }
}

/** Singleton instance used by the controller layer. */
export const transactionService = new TransactionService();
