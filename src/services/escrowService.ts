import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import Escrow, { IEscrow } from '../models/Escrow';
import Delivery, { IDelivery } from '../models/Delivery';
import AppError from '../utils/AppError';
import logger from '../config/logger';

/**
 * Minimal delivery projection embedded in the escrow status response so the
 * frontend can render the escrow panel without a second round-trip.
 */
export interface EscrowDeliverySummary {
  id: string;
  deliveryId?: string;
  trackingNumber?: string;
  status?: string;
  escrowAmount?: number;
  isArchived: boolean;
}

/** Shape returned by {@link EscrowService.getEscrowByDeliveryId}. */
export interface EscrowStatusResult {
  escrow: IEscrow;
  delivery: EscrowDeliverySummary;
}

export class EscrowService {
  /**
   * Resolve a delivery from the database by either its MongoDB `_id` or its
   * business `deliveryId` key, so the endpoint works with whichever identifier
   * the caller holds.
   *
   * @param id - Delivery `_id` or `deliveryId`.
   * @throws  {AppError} 400 when the identifier is blank.
   * @throws  {AppError} 404 when no delivery matches.
   */
  private async resolveDelivery(id: string): Promise<IDelivery> {
    const identifier = id?.trim();

    if (!identifier) {
      throw new AppError('Delivery identifier is required', StatusCodes.BAD_REQUEST);
    }

    const delivery = Types.ObjectId.isValid(identifier)
      ? await Delivery.findById(identifier).exec()
      : await Delivery.findOne({ deliveryId: identifier }).exec();

    if (!delivery) {
      throw new AppError(`Delivery '${identifier}' not found`, StatusCodes.NOT_FOUND);
    }

    return delivery;
  }

  /**
   * Fetch the escrow record associated with a delivery.
   *
   * The response is read straight from the `escrows` collection — the on-chain
   * state is mirrored into that collection by the Soroban event indexer, so no
   * RPC call is needed on the read path.
   *
   * @param id - Delivery `_id` or `deliveryId`.
   * @returns    The escrow document plus a summary of its delivery.
   * @throws     {AppError} 404 when the delivery or its escrow does not exist.
   */
  public async getEscrowByDeliveryId(id: string): Promise<EscrowStatusResult> {
    const delivery = await this.resolveDelivery(id);

    const escrow = await Escrow.findOne({ delivery: delivery._id }).exec();

    if (!escrow) {
      throw new AppError(
        `No escrow record exists for delivery '${String(delivery._id)}'`,
        StatusCodes.NOT_FOUND,
      );
    }

    logger.debug(
      `[EscrowService] Escrow resolved — delivery=${String(delivery._id)} ` +
        `escrow=${String(escrow._id)} status=${escrow.status}`,
    );

    return {
      escrow,
      delivery: {
        id: String(delivery._id),
        deliveryId: delivery.deliveryId,
        trackingNumber: delivery.trackingNumber,
        status: delivery.status,
        escrowAmount: delivery.escrowAmount,
        isArchived: Boolean(delivery.isDeleted),
      },
    };
  }
}

/** Singleton instance used by the controller layer. */
export const escrowService = new EscrowService();
import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Escrow, { EscrowStatus, IEscrow } from '../models/Escrow';
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
 */
export const scanForExpiredEscrows = async (): Promise<ScanExpiredEscrowsResult> => {
  const now = new Date();

  const expiredCandidates = await Escrow.find({
    status: EscrowStatus.LOCKED,
    expiresAt: { $lte: now },
  });

  if (expiredCandidates.length === 0) {
    return { scannedAt: now.toISOString(), flaggedCount: 0, flaggedEscrows: [] };
  }

  let flaggedLedger: number | undefined;
  try {
    flaggedLedger = await sorobanService.getLatestLedger();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(
      `[EscrowMonitor] Failed to fetch latest Soroban ledger for audit stamp: ${message}`,
    );
  }

  const idsToFlag = expiredCandidates.map((escrow) => escrow._id);

  await Escrow.updateMany(
    { _id: { $in: idsToFlag } },
    {
      $set: {
        status: EscrowStatus.EXPIRED,
        flaggedAt: now,
        ...(flaggedLedger !== undefined ? { flaggedLedger } : {}),
      },
    },
  );

  const flaggedEscrows = await Escrow.find({ _id: { $in: idsToFlag } });

  logger.info(
    `[EscrowMonitor] Flagged ${flaggedEscrows.length} expired escrow(s) at ledger=${
      flaggedLedger ?? 'unknown'
    }`,
  );

  return {
    scannedAt: now.toISOString(),
    flaggedCount: flaggedEscrows.length,
    flaggedEscrows,
  };
};

/**
 * Retrieves a paginated list of expired escrows flagged for admin review.
 */
export const getFlaggedEscrows = async (
  input: GetFlaggedEscrowsInput,
): Promise<GetFlaggedEscrowsResult> => {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter = { status: EscrowStatus.EXPIRED };

  const [escrows, total] = await Promise.all([
    Escrow.find(filter).sort({ flaggedAt: -1 }).skip(skip).limit(limit),
    Escrow.countDocuments(filter),
  ]);

  return {
    escrows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 0,
  };
};

/**
 * Marks a flagged (expired) escrow as resolved by an administrator.
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

  if (escrow.status !== EscrowStatus.EXPIRED) {
    throw new AppError('Only escrows flagged as expired can be resolved.', StatusCodes.CONFLICT);
  }

  escrow.status = EscrowStatus.RESOLVED;
  escrow.resolvedAt = new Date();
  escrow.resolvedBy = adminId;
  escrow.resolutionNotes = notes;

  await escrow.save();

  logger.info(`[EscrowMonitor] Admin ${adminId} resolved escrow ${escrowId}. Notes: "${notes}"`);

  return escrow;
};
