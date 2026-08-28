import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status-codes';
import { escrowService } from '../services/escrow.service';
import { syncEscrowFundedEvents } from '../indexer/escrowHandlers';
import { AppError } from '../utils/AppError';
import { FundEscrowBody } from '../validators/escrowValidator';

/**
 * EscrowController handles HTTP requests for escrow records and for
 * manually triggering the escrow_funded indexer.
 *
 * Soroban has no push/webhook mechanism, so the sync endpoint lets
 * operators (or a scheduled job) trigger a poll of the RPC node for new
 * `escrow_funded` events on demand.
 */
export class EscrowController {
  async getByDelivery(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const escrow = await escrowService.getByDeliveryId(req.params.deliveryId);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: escrow,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const escrow = await escrowService.getByContractId(req.params.contractId);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: escrow,
      });
    } catch (error) {
      next(error);
    }
  }

  async sync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startLedger = Number(req.body.startLedger);
      if (!Number.isInteger(startLedger) || startLedger < 0) {
        throw new AppError('startLedger must be a non-negative integer', httpStatus.BAD_REQUEST);
      }

      const contractId: string | undefined = req.body.contractId;
      const summary = await syncEscrowFundedEvents(startLedger, contractId);

      res.status(httpStatus.OK).json({
        status: 'success',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/escrow/fund
   *
   * Records an on-chain `escrow_funded` event supplied by the caller.
   * Idempotency is enforced at two levels:
   *   1. HTTP level  — `requireIdempotencyKey` middleware (Idempotency-Key header).
   *   2. Service level — `recordEscrowFunded` skips already-processed tx hashes.
   *
   * @openapi
   * /v1/escrow/fund:
   *   post:
   *     tags: [Escrow]
   *     summary: Fund (record) an escrow for a delivery
   *     description: |
   *       Records an on-chain escrow_funded event against a delivery.
   *       Requires the `Idempotency-Key` header to prevent duplicate charges
   *       on network retries.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/FundEscrowRequest'
   *     responses:
   *       201:
   *         description: Escrow funded successfully
   *       409:
   *         description: Duplicate idempotency key or escrow already funded
   *       422:
   *         description: Missing Idempotency-Key header
   */
  async fund(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as FundEscrowBody;

      const escrow = await escrowService.fund({
        deliveryId: body.deliveryId,
        contractId: body.contractId,
        transactionHash: body.transactionHash,
        amount: body.amount,
        asset: body.asset,
        fundedBy: body.fundedBy,
        ledger: body.ledger,
      });

      res.status(httpStatus.CREATED).json({
        status: 'success',
        data: escrow,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const escrowController = new EscrowController();
