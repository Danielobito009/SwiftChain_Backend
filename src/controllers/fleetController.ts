import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { createFleet as createFleetService } from '../services/fleetService';
import type { IUser } from '../interfaces/IUser';
import AppError from '../utils/AppError';

// ─── Request body types ────────────────────────────────────────────────────────

interface CreateFleetBody {
  name?: unknown;
}

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fleets
 *
 * Creates a new fleet owned by the authenticated enterprise user.
 * Protected by `authenticate` + `requireRole(UserRole.ENTERPRISE)`.
 *
 * Body:
 *   - name {string} Required — fleet display name.
 */
export const createFleet = async (
  req: Request<unknown, unknown, CreateFleetBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const owner = (req as Request & { user?: IUser }).user;
    if (!owner) {
      throw new AppError('Authentication required.', StatusCodes.UNAUTHORIZED);
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new AppError(
        'A fleet name of at least 2 characters is required.',
        StatusCodes.BAD_REQUEST,
      );
    }

    const fleet = await createFleetService({
      ownerId: owner._id.toString(),
      name,
    });

    res.status(StatusCodes.CREATED).json({
      status: 'success',
      message: 'Fleet created successfully.',
      data: { fleet },
    });
  } catch (error) {
    next(error);
  }
};
