import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Fleet from '../models/Fleet';
import User from '../models/User';
import { UserRole } from '../interfaces/IUser';
import { IFleet } from '../interfaces/IFleet';
import AppError from '../utils/AppError';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateFleetInput {
  ownerId: string;
  name: string;
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Creates a new fleet owned by an enterprise user.
 *
 * Business rules enforced here:
 *  - Owner must exist and hold the ENTERPRISE role (defense-in-depth: the
 *    route is also gated by requireRole, but the service does not trust the
 *    caller blindly since it can be invoked from other code paths later).
 *  - Fleet name is required and de-duplicated per owner (an enterprise user
 *    cannot create two fleets with the same name).
 */
export const createFleet = async (input: CreateFleetInput): Promise<IFleet> => {
  const { ownerId, name } = input;

  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new AppError('Invalid owner ID format.', StatusCodes.BAD_REQUEST);
  }

  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new AppError('Owner not found.', StatusCodes.NOT_FOUND);
  }

  if (owner.role !== UserRole.ENTERPRISE) {
    throw new AppError('Only enterprise users can create fleets.', StatusCodes.FORBIDDEN);
  }

  const existing = await Fleet.findOne({ ownerId, name: name.trim() });
  if (existing) {
    throw new AppError('You already have a fleet with this name.', StatusCodes.CONFLICT);
  }

  return Fleet.create({ ownerId, name: name.trim() });
};
