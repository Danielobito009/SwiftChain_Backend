import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status-codes';
import { escrowService } from '../services/escrow.service';
import { syncEscrowFundedEvents } from '../indexer/escrowHandlers';
import { AppError } from '../utils/AppError';

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
}

export const escrowController = new EscrowController();
