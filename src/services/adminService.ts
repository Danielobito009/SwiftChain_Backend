import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import User from '../models/User';
import { IUser, UserRole, UserStatus } from '../interfaces/IUser';
import AppError from '../utils/AppError';
import logger from '../config/logger';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface SuspendUserInput {
  /** MongoDB ObjectId string of the target user. */
  targetUserId: string;
  /** MongoDB ObjectId string of the admin performing the action. */
  adminId: string;
  /** Human-readable reason required for the audit trail. */
  reason: string;
  /**
   * Whether to apply a full ban instead of a temporary suspension.
   * Defaults to false (suspension).
   */
  ban?: boolean;
}

export interface SuspendUserResult {
  user: IUser;
  action: 'suspended' | 'banned';
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Suspends or bans a user account.
 *
 * Business rules enforced here:
 *  - Target user must exist.
 *  - An admin cannot suspend or ban themselves.
 *  - An admin cannot suspend or ban another admin (privilege escalation guard).
 *  - A user already in the desired status is a no-op that returns 409.
 *  - `reason` is mandatory for audit purposes.
 */
export const suspendUser = async (input: SuspendUserInput): Promise<SuspendUserResult> => {
  const { targetUserId, adminId, reason, ban = false } = input;

  // 1. Validate the target ID is a valid ObjectId before hitting the DB
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw new AppError('Invalid user ID format.', StatusCodes.BAD_REQUEST);
  }

  // 2. Self-action guard
  if (targetUserId === adminId) {
    throw new AppError(
      'Admins cannot suspend or ban their own account.',
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  // 3. Load the target user
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new AppError('User not found.', StatusCodes.NOT_FOUND);
  }

  // 4. Privilege escalation guard — admins cannot action other admins
  if (targetUser.role === UserRole.ADMIN) {
    throw new AppError(
      'Admin accounts cannot be suspended or banned by another admin.',
      StatusCodes.FORBIDDEN,
    );
  }

  const desiredStatus: UserStatus = ban ? UserStatus.BANNED : UserStatus.SUSPENDED;

  // 5. Idempotency — already in the desired state
  if (targetUser.status === desiredStatus) {
    throw new AppError(`User is already ${desiredStatus}.`, StatusCodes.CONFLICT);
  }

  // 6. Apply the status change with audit metadata
  targetUser.status = desiredStatus;
  targetUser.suspendedAt = new Date();
  targetUser.suspendedReason = reason;

  await targetUser.save();

  logger.info(`Admin ${adminId} ${desiredStatus} user ${targetUserId}. Reason: "${reason}"`);

  return { user: targetUser, action: desiredStatus };
};
