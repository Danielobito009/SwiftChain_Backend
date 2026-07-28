import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createDispute } from '../services/disputeService';
import type { CreateDisputeInput } from '../validators/disputeValidator';
import type { IUser } from '../interfaces/IUser';
import AppError from '../utils/AppError';

// ─── POST /api/v1/disputes ──────────────────────────────────────────────────────

/**
 * POST /api/v1/disputes
 *
 * Opens a delivery dispute before any corresponding on-chain dispute
 * workflow is executed. `req.body` has already been validated and
 * normalized by the `validate(createDisputeSchema)` middleware.
 *
 * Responds:
 *   201 — success, returns the created dispute document.
 */
export const openDispute = async (
  req: Request<unknown, unknown, CreateDisputeInput>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const user = (req as Request & { user?: IUser }).user;

    if (!user) {
      throw new AppError('Authentication required.', StatusCodes.UNAUTHORIZED);
    }

    const { deliveryId, reason, description, evidenceUrls } = req.body;

    const dispute = await createDispute({
      deliveryId,
      raisedBy: user._id.toString(),
      reason,
      description,
      evidenceUrls,
    });

    res.status(StatusCodes.CREATED).json({
      status: 'success',
      message: 'Dispute opened successfully.',
      data: { dispute },
    });
  } catch (error) {
    next(error);
  }
};
