import mongoose from 'mongoose';
import logger from '../config/logger';
import DriverProfile from '../models/DriverProfile';
import { computeTier } from '../interfaces/IDriverProfile';
import { recordProcessedLedger } from '../services/monitorService';

/**
 * Parsed representation of a reputation event emitted by the Soroban contract.
 * Contract topics: [event_type, driver_address]
 * Contract data:   { points: number }
 */
export interface ReputationEvent {
  /** Stellar account address of the driver. */
  driverAddress: string;
  /** Absolute change in reputation points (always positive). */
  points: number;
  /** On-chain ledger sequence number for idempotency tracking. */
  ledgerSequence: number;
}

/**
 * Handle a `reputation_increased` event from the SwiftChain Soroban contract.
 *
 * Looks up the DriverProfile by the on-chain driver address (stored as userId
 * until a dedicated address field is added), increments reputationPoints, and
 * recomputes the tier. Creates a profile if one does not yet exist.
 */
export async function handleReputationIncreased(event: ReputationEvent): Promise<void> {
  if (!event.driverAddress || typeof event.points !== 'number' || event.points <= 0) {
    logger.warn('[reputationHandlers] reputation_increased: invalid event payload', { event });
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const profile = await DriverProfile.findOneAndUpdate(
        { userId: event.driverAddress as unknown as mongoose.Types.ObjectId },
        { $inc: { reputationPoints: event.points } },
        { new: true, upsert: true, session },
      );

      if (!profile) {
        throw new Error(`DriverProfile upsert returned null for address ${event.driverAddress}`);
      }

      const newTier = computeTier(profile.reputationPoints);
      if (profile.tier !== newTier) {
        await DriverProfile.updateOne(
          { _id: profile._id },
          { $set: { tier: newTier } },
          { session },
        );
        logger.info('[reputationHandlers] reputation_increased: tier updated', {
          driverAddress: event.driverAddress,
          reputationPoints: profile.reputationPoints,
          tier: newTier,
          ledgerSequence: event.ledgerSequence,
        });
      } else {
        logger.info('[reputationHandlers] reputation_increased: points updated', {
          driverAddress: event.driverAddress,
          reputationPoints: profile.reputationPoints,
          ledgerSequence: event.ledgerSequence,
        });
      }
    });
  } catch (err) {
    logger.error('[reputationHandlers] reputation_increased: failed to update profile', {
      driverAddress: event.driverAddress,
      ledgerSequence: event.ledgerSequence,
      error: err,
    });
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Handle a `reputation_slashed` event from the SwiftChain Soroban contract.
 *
 * Decrements reputationPoints (floor at 0) and recomputes the tier.
 * A missing profile is treated as a no-op with a warning, since a slash
 * without a prior reputation record indicates a data-ordering anomaly.
 */
export async function handleReputationSlashed(event: ReputationEvent): Promise<void> {
  if (!event.driverAddress || typeof event.points !== 'number' || event.points <= 0) {
    logger.warn('[reputationHandlers] reputation_slashed: invalid event payload', { event });
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await DriverProfile.findOne(
        { userId: event.driverAddress as unknown as mongoose.Types.ObjectId },
        null,
        { session },
      );

      if (!existing) {
        logger.warn('[reputationHandlers] reputation_slashed: no profile found, skipping', {
          driverAddress: event.driverAddress,
          ledgerSequence: event.ledgerSequence,
        });
        return;
      }

      const newPoints = Math.max(0, existing.reputationPoints - event.points);
      const newTier = computeTier(newPoints);

      await DriverProfile.updateOne(
        { _id: existing._id },
        { $set: { reputationPoints: newPoints, tier: newTier } },
        { session },
      );

      logger.info('[reputationHandlers] reputation_slashed: points and tier updated', {
        driverAddress: event.driverAddress,
        reputationPoints: newPoints,
        tier: newTier,
        ledgerSequence: event.ledgerSequence,
      });
    });
  } catch (err) {
    logger.error('[reputationHandlers] reputation_slashed: failed to update profile', {
      driverAddress: event.driverAddress,
      ledgerSequence: event.ledgerSequence,
      error: err,
    });
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Route an incoming event by its type string to the correct handler.
 * Unknown event types are logged and ignored.
 */
export async function dispatchReputationEvent(
  eventType: string,
  event: ReputationEvent,
): Promise<void> {
  switch (eventType) {
    case 'reputation_increased':
      await handleReputationIncreased(event);
      break;
    case 'reputation_slashed':
      await handleReputationSlashed(event);
      break;
    default:
      logger.warn('[reputationHandlers] unknown event type, ignoring', { eventType });
      return;
  }

  if (typeof event.ledgerSequence === 'number') {
    await recordProcessedLedger(event.ledgerSequence);
  }
}
