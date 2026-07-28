import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { escrowService } from '../services/escrowService';

/**
 * EscrowController exposes read access to escrow state so the frontend can
 * display the locking status of a delivery.
 *
 * All business logic and persistence live in `EscrowService`; this layer only
 * translates HTTP <-> service calls.
 */
export class EscrowController {
  /**
   * GET /api/v1/escrow/delivery/:id
   *
   * Returns the escrow document associated with the given delivery. `:id`
   * accepts either the delivery MongoDB `_id` or its business `deliveryId`.
   *
   * Response 200:
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "escrow": {
   *       "id": "65f0c1...",
   *       "delivery": "65f0be...",
   *       "status": "locked",
   *       "amount": 150,
   *       "assetCode": "XLM",
   *       "contractId": "CB...",
   *       "payerAddress": "GA...",
   *       "lockTransactionHash": "9f2b...",
   *       "lockedAt": "2026-01-04T10:12:31.000Z",
   *       "lastSyncedLedger": 1240331,
   *       "isFundsLocked": true,
   *       "isSettled": false,
   *       "createdAt": "2026-01-04T10:11:02.000Z",
   *       "updatedAt": "2026-01-04T10:12:31.000Z"
   *     },
   *     "delivery": {
   *       "id": "65f0be...",
   *       "trackingNumber": "SWIFT-001",
   *       "status": "in_progress",
   *       "escrowAmount": 150,
   *       "isArchived": false
   *     }
   *   }
   * }
   * ```
   *
   * Response 404 — the delivery does not exist, or it has no escrow record.
   */
  public async getEscrowByDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { escrow, delivery } = await escrowService.getEscrowByDeliveryId(req.params.id);

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: { escrow: escrow.toJSON(), delivery },
      });
    } catch (error) {
      next(error);
    }
  }
}

/** Singleton instance used by the router. */
export const escrowController = new EscrowController();
