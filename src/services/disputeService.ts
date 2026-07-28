import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Dispute, { DisputeReason, DisputeStatus, IDispute } from '../models/Dispute';
import Delivery, { DeliveryStatus } from '../models/Delivery';
import { sorobanService } from '../blockchain/soroban.service';
import AppError from '../utils/AppError';
import logger from '../config/logger';

// ─── Constants ──────────────────────────────────────────────────────────────────

/**
 * Delivery states considered "active" — i.e. a delivery that is actually
 * underway and can still be disputed. Deliveries that have not yet been
 * assigned, or that have already completed/cancelled, are not eligible.
 */
const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.IN_PROGRESS,
];

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreateDisputeInput {
  deliveryId: string;
  raisedBy: string;
  reason: DisputeReason;
  description: string;
  evidenceUrls?: string[];
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Opens a delivery dispute prior to any on-chain dispute workflow.
 *
 * Business rules enforced here:
 *  - The referenced delivery must exist.
 *  - The delivery must currently be in an active state (assigned or
 *    in-progress) — pending, completed, and cancelled deliveries cannot be
 *    disputed.
 *  - Only a participant in the delivery (the customer or the assigned
 *    driver) may open a dispute against it.
 *  - A delivery may not have more than one open (unresolved) dispute at a
 *    time.
 */
export const createDispute = async (input: CreateDisputeInput): Promise<IDispute> => {
  const { deliveryId, raisedBy, reason, description, evidenceUrls } = input;

  if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
    throw new AppError('Invalid delivery ID format.', StatusCodes.BAD_REQUEST);
  }

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new AppError('Delivery not found.', StatusCodes.NOT_FOUND);
  }

  if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
    throw new AppError(
      `Disputes can only be opened for deliveries that are assigned or in progress. Current status: '${delivery.status}'.`,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  const isParticipant = delivery.userId === raisedBy || delivery.driverId === raisedBy;
  if (!isParticipant) {
    throw new AppError(
      'Only the customer or driver associated with this delivery may open a dispute.',
      StatusCodes.FORBIDDEN,
    );
  }

  const existingOpenDispute = await Dispute.findOne({
    deliveryId,
    status: { $in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
  });
  if (existingOpenDispute) {
    throw new AppError(
      'An unresolved dispute already exists for this delivery.',
      StatusCodes.CONFLICT,
    );
  }

  let raisedAtLedger: number | undefined;
  try {
    raisedAtLedger = await sorobanService.getLatestLedger();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[Dispute] Failed to fetch latest Soroban ledger for audit stamp: ${message}`);
  }

  const dispute = await Dispute.create({
    deliveryId,
    raisedBy,
    reason,
    description,
    evidenceUrls,
    status: DisputeStatus.OPEN,
    raisedAtLedger,
  });

  logger.info(
    `[Dispute] User ${raisedBy} opened dispute ${dispute._id} for delivery ${deliveryId}`,
  );

  return dispute;
};
