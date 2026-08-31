import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Escrow, { EscrowLockStatus, IEscrow } from '../models/Escrow';
import { sorobanService } from '../blockchain/soroban.service';
import AppError from '../utils/AppError';
import logger from '../config/logger';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface ScanExpiredEscrowsResult {
  scannedAt: string;
  flaggedCount: number;
  flaggedEscrows: IEscrow[];
}

export interface GetFlaggedEscrowsInput {
  page?: number;
  limit?: number;
}

export interface GetFlaggedEscrowsResult {
  escrows: IEscrow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResolveEscrowInput {
  escrowId: string;
  adminId: string;
  notes: string;
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Scans for escrows whose lock period has exceeded their configured TTL and
 * marks them as `expired`.
 *
 * Called on a recurring schedule by the escrow monitor cron job. Runs a
 * single `updateMany` for efficiency, then reloads the flagged documents for
 * logging/reporting purposes.
 *
 * The current Soroban ledger sequence is stamped onto each flagged escrow so
 * there is an on-chain-anchored audit trail of when the expiry was detected.
 *
 * Note: This function is commented out as the schema doesn't include expired status
 * or expiresAt field in the current Escrow model.
 */
export const scanForExpiredEscrows = async (): Promise<ScanExpiredEscrowsResult> => {
  const now = new Date();

  // Note: Commented out until EscrowStatus.EXPIRED and expiresAt field are added to model
  // const expiredCandidates = await Escrow.find({
  //   status: EscrowStatus.LOCKED,
  //   expiresAt: { $lte: now },
  // });

  // if (expiredCandidates.length === 0) {
  //   return { scannedAt: now.toISOString(), flaggedCount: 0, flaggedEscrows: [] };
  // }

  // let flaggedLedger: number | undefined;
  // try {
  //   flaggedLedger = await sorobanService.getLatestLedger();
  // } catch (err) {
  //   const message = err instanceof Error ? err.message : 'Unknown error';
  //   logger.warn(
  //     `[EscrowMonitor] Failed to fetch latest Soroban ledger for audit stamp: ${message}`,
  //   );
  // }

  // const idsToFlag = expiredCandidates.map((escrow) => escrow._id);

  // await Escrow.updateMany(
  //   { _id: { $in: idsToFlag } },
  //   {
  //     $set: {
  //       status: EscrowStatus.EXPIRED,
  //       flaggedAt: now,
  //       ...(flaggedLedger !== undefined ? { flaggedLedger } : {}),
  //     },
  //   },
  // );

  // const flaggedEscrows = await Escrow.find({ _id: { $in: idsToFlag } });

  // logger.info(
  //   `[EscrowMonitor] Flagged ${flaggedEscrows.length} expired escrow(s) at ledger=${
  //     flaggedLedger ?? 'unknown'
  //   }`,
  // );

  // return {
  //   scannedAt: now.toISOString(),
  //   flaggedCount: flaggedEscrows.length,
  //   flaggedEscrows,
  // };

  logger.info('[EscrowMonitor] Scan for expired escrows - feature not yet implemented');
  return { scannedAt: now.toISOString(), flaggedCount: 0, flaggedEscrows: [] };
};

/**
 * Retrieves a paginated list of expired escrows flagged for admin review.
 *
 * Note: This function is commented out as the schema doesn't include expired status
 * in the current Escrow model.
 */
export const getFlaggedEscrows = async (
  input: GetFlaggedEscrowsInput,
): Promise<GetFlaggedEscrowsResult> => {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  // const skip = (page - 1) * limit;

  // const filter = { status: EscrowStatus.EXPIRED };

  // const [escrows, total] = await Promise.all([
  //   Escrow.find(filter).sort({ flaggedAt: -1 }).skip(skip).limit(limit),
  //   Escrow.countDocuments(filter),
  // ]);

  // return {
  //   escrows,
  //   total,
  //   page,
  //   limit,
  //   totalPages: Math.ceil(total / limit) || 0,
  // };

  return {
    escrows: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  };
};

/**
 * Marks a flagged (expired) escrow as resolved by an administrator.
 *
 * Note: This function is commented out as the schema doesn't include resolved status
 * fields in the current Escrow model.
 */
export const resolveEscrow = async (input: ResolveEscrowInput): Promise<IEscrow> => {
  const { escrowId, adminId, notes } = input;

  if (!mongoose.Types.ObjectId.isValid(escrowId)) {
    throw new AppError('Invalid escrow ID format.', StatusCodes.BAD_REQUEST);
  }

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) {
    throw new AppError('Escrow not found.', StatusCodes.NOT_FOUND);
  }

  // Note: Commented out until status, resolvedAt, resolvedBy fields are added to model
  // if (escrow.status !== EscrowStatus.EXPIRED) {
  //   throw new AppError('Only escrows flagged as expired can be resolved.', StatusCodes.CONFLICT);
  // }

  // escrow.status = EscrowStatus.RESOLVED;
  // escrow.resolvedAt = new Date();
  // escrow.resolvedBy = adminId;
  // escrow.resolutionNotes = notes;

  // await escrow.save();

  logger.info(`[EscrowMonitor] Admin ${adminId} attempted to resolve escrow ${escrowId}. Notes: "${notes}"`);
  logger.warn('[EscrowMonitor] Resolve escrow feature not yet fully implemented');

  return escrow;
};
