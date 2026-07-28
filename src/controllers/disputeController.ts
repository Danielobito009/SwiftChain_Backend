import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { disputeService } from '../services/disputeService';
import { DisputeStatus } from '../models/Dispute';

class DisputeController {
  /**
   * GET /api/v1/disputes
   *
   * Lists disputes synced from on-chain events, newest first.
   * Supports ?page, ?limit, and ?status ("open" | "resolved") query params.
   */
  async listDisputes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const statusParam = req.query.status as string | undefined;
      const status = Object.values(DisputeStatus).includes(statusParam as DisputeStatus)
        ? (statusParam as DisputeStatus)
        : undefined;

      const result = await disputeService.listDisputes(page, limit, status);

      res.status(StatusCodes.OK).json({
        status: 'success',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/disputes/:disputeId
   *
   * Fetches a single dispute by its on-chain disputeId.
   */
  async getDispute(
    req: Request<{ disputeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const dispute = await disputeService.getDisputeById(req.params.disputeId);

      res.status(StatusCodes.OK).json({
        status: 'success',
        data: { dispute },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const disputeController = new DisputeController();
