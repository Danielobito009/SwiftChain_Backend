import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
  createFleet as createFleetService,
  inviteDriver as inviteDriverService,
  respondToInvitation as respondToInvitationService,
} from '../services/fleetService';
import type { IUser } from '../interfaces/IUser';
import AppError from '../utils/AppError';

// ─── Request body types ────────────────────────────────────────────────────────

interface CreateFleetBody {
  name?: unknown;
}

interface InviteDriverBody {
  driverId?: unknown;
}

interface RespondToInvitationBody {
  accept?: unknown;
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

/**
 * POST /api/v1/fleets/:id/invite
 *
 * Invites a driver to join the fleet. Protected by `authenticate` +
 * `requireRole(UserRole.ENTERPRISE)`; ownership is additionally enforced in
 * the service layer.
 *
 * Body:
 *   - driverId {string} Required — MongoDB ObjectId of the invited driver.
 */
export const inviteDriver = async (
  req: Request<{ id: string }, unknown, InviteDriverBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const owner = (req as Request & { user?: IUser }).user;
    if (!owner) {
      throw new AppError('Authentication required.', StatusCodes.UNAUTHORIZED);
    }

    const { id: fleetId } = req.params;
    const { driverId } = req.body;

    if (!driverId || typeof driverId !== 'string') {
      throw new AppError('driverId is required.', StatusCodes.BAD_REQUEST);
    }

    const invitation = await inviteDriverService({
      fleetId,
      driverId,
      invitedBy: owner._id.toString(),
    });

    res.status(StatusCodes.CREATED).json({
      status: 'success',
      message: 'Invitation sent successfully.',
      data: { invitation },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/fleets/invitations/:invitationId
 *
 * A driver accepts or declines a pending fleet invitation. Protected by
 * `authenticate` + `requireRole(UserRole.DRIVER)`.
 *
 * Body:
 *   - accept {boolean} Required — true to accept, false to decline.
 */
export const respondToInvitation = async (
  req: Request<{ invitationId: string }, unknown, RespondToInvitationBody>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const driver = (req as Request & { user?: IUser }).user;
    if (!driver) {
      throw new AppError('Authentication required.', StatusCodes.UNAUTHORIZED);
    }

    const { invitationId } = req.params;
    const { accept } = req.body;

    if (typeof accept !== 'boolean') {
      throw new AppError('accept must be a boolean value.', StatusCodes.BAD_REQUEST);
    }

    const invitation = await respondToInvitationService({
      invitationId,
      driverId: driver._id.toString(),
      accept,
    });

    res.status(StatusCodes.OK).json({
      status: 'success',
      message: `Invitation ${invitation.status} successfully.`,
      data: { invitation },
    });
  } catch (error) {
    next(error);
  }
};
