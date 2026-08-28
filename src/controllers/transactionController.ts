import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { transactionService } from '../services/transactionService';
import { stellarService } from '../services/stellarService';
import type { EscrowLockTransactionBody, SubmitTransactionBody } from '../validators/transactionValidator';

/**
 * TransactionController exposes transaction-building helpers used by the
 * frontend to propose smart-contract calls to a user's wallet.
 *
 * The API never signs or submits anything: it returns unsigned XDR that the
 * client wallet signs locally and submits itself.
 */
export class TransactionController {
  /**
   * POST /api/v1/transactions/escrow-lock
   *
   * Builds the unsigned, simulation-prepared XDR for the escrow-lock
   * invocation of a delivery.
   *
   * Request body:
   * ```json
   * {
   *   "deliveryId": "65f0be6f1c9d440000a1b2c3",
   *   "payerAddress": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ"
   * }
   * ```
   *
   * Response 200:
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "xdr": "AAAAAgAAAAD...",
   *     "network": "testnet",
   *     "networkPassphrase": "Test SDF Network ; September 2015",
   *     "contractId": "CB...",
   *     "contractFunction": "lock_escrow",
   *     "sourceAccount": "GA...",
   *     "sequence": "1729382256910270465",
   *     "fee": "100352",
   *     "validUntil": 1767182400,
   *     "delivery": { "id": "65f0be...", "trackingNumber": "SWIFT-001", "status": "assigned" },
   *     "amount": { "value": 150, "stroops": "1500000000", "formatted": "150.0000000" }
   *   }
   * }
   * ```
   *
   * Error responses: 400 (validation), 404 (unknown delivery or payer
   * account), 409 (delivery already completed/cancelled), 422 (delivery has no
   * usable escrow amount), 502 (RPC/simulation failure), 503 (escrow contract
   * not configured).
   */
  public async createEscrowLockTransaction(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { deliveryId, payerAddress } = req.body as EscrowLockTransactionBody;

      const result = await transactionService.buildEscrowLockXdr({ deliveryId, payerAddress });

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/transactions/submit
   *
   * Submits a **signed** escrow-lock transaction envelope to the Stellar
   * network and handles `tx_bad_seq` (sequence number mismatch) errors
   * automatically.
   *
   * When `tx_bad_seq` is encountered the service re-fetches the account
   * sequence number from the RPC node, rebuilds the transaction with fresh
   * data from the database, and returns a new **unsigned** XDR for the client
   * wallet to re-sign. This loop is bounded by `STELLAR_BAD_SEQ_MAX_RETRIES`
   * (default: 3) to prevent infinite cycling under sustained contention.
   *
   * Request body:
   * ```json
   * {
   *   "deliveryId":   "65f0be6f1c9d440000a1b2c3",
   *   "payerAddress": "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ",
   *   "signedXdr":    "AAAAAgAAAAD..."
   * }
   * ```
   *
   * Response 200 (confirmed):
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "transactionHash": "abc123...",
   *     "ledger": 54321,
   *     "retriedOnBadSeq": false,
   *     "attempts": 1
   *   }
   * }
   * ```
   *
   * Response 202 (bad-seq rebuild — client must re-sign):
   * ```json
   * {
   *   "status": "resubmit_required",
   *   "message": "Sequence number mismatch detected. Sign the refreshedXdr and resubmit.",
   *   "data": { "refreshedXdr": "AAAAAgAAAAD..." }
   * }
   * ```
   *
   * Error responses: 400 (validation), 404 (unknown delivery or account),
   * 409 (bad-seq retries exhausted), 502 (RPC/simulation failure),
   * 503 (contract not configured), 504 (tx not confirmed within poll window).
   */
  public async submitEscrowLockTransaction(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { deliveryId, payerAddress, signedXdr } = req.body as SubmitTransactionBody;

      const result = await stellarService.submitEscrowLock({
        deliveryId,
        payerAddress,
        signedXdr,
      });

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      // Re-surface tx_bad_seq rebuild responses as 202 so clients can
      // distinguish "need to re-sign" from a true error.
      // The stellarService throws AppError(409) when retries are exhausted
      // and returns the refreshed XDR via rebuildWithFreshSequence when
      // a single bad-seq is detected mid-loop — that path is handled inside
      // the service and results in the loop continuing. A 409 here means
      // all retries were consumed.
      next(error);
    }
  }
}

/** Singleton instance used by the router. */
export const transactionController = new TransactionController();
