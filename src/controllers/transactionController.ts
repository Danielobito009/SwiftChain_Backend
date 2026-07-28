import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { transactionService } from '../services/transactionService';
import type { EscrowLockTransactionBody } from '../validators/transactionValidator';

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
}

/** Singleton instance used by the router. */
export const transactionController = new TransactionController();
