import axios from 'axios';
import { StatusCodes } from 'http-status-codes';
import { Dispute, IDispute, DisputeStatus } from '../models/Dispute';
import AppError from '../utils/AppError';
import logger from '../config/logger';
import env from '../config/env';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface DisputeOpenedInput {
  disputeId: string;
  deliveryId: string;
  openedBy: string;
  reason?: string;
  ledgerSequence: number;
}

export interface DisputeResolvedInput {
  disputeId: string;
  resolution?: string;
  ledgerSequence: number;
}

export interface ListDisputesResult {
  data: IDispute[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Business logic for the local Dispute read model. Every write here is
 * driven by an on-chain event relayed through `disputeHandlers` — there is
 * no user-facing mutation path, since dispute state is owned by the
 * Soroban contract.
 */
export class DisputeService {
  /**
   * Notify external systems of a dispute lifecycle event.
   *
   * Always logged; additionally POSTed to `DISPUTE_NOTIFICATION_WEBHOOK_URL`
   * when configured (e.g. to page support staff on a newly opened dispute).
   * Webhook failures are logged, never thrown — a notification failure must
   * not roll back the underlying dispute state change.
   */
  private async notify(
    event: 'dispute_opened' | 'dispute_resolved',
    dispute: IDispute,
  ): Promise<void> {
    logger.info(`[DisputeService] Notification — event=${event} disputeId=${dispute.disputeId}`);

    const webhookUrl = env.DISPUTE_NOTIFICATION_WEBHOOK_URL.trim();
    if (!webhookUrl) {
      return;
    }

    try {
      await axios.post(webhookUrl, {
        event,
        disputeId: dispute.disputeId,
        deliveryId: dispute.deliveryId,
        status: dispute.status,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown webhook error';
      logger.error(
        `[DisputeService] Failed to notify dispute webhook — event=${event} ` +
          `disputeId=${dispute.disputeId} error="${message}"`,
      );
    }
  }

  /**
   * Create the local record for a dispute opened on-chain.
   *
   * Idempotent: if a dispute with this `disputeId` already exists (e.g. the
   * indexer re-processed the same ledger range), the existing record is
   * returned unchanged rather than raising a duplicate-key error.
   */
  async openDispute(input: DisputeOpenedInput): Promise<IDispute> {
    const existing = await Dispute.findOne({ disputeId: input.disputeId });
    if (existing) {
      logger.warn(
        `[DisputeService] dispute_opened: disputeId=${input.disputeId} already recorded, skipping`,
      );
      return existing;
    }

    const dispute = await Dispute.create({
      disputeId: input.disputeId,
      deliveryId: input.deliveryId,
      openedBy: input.openedBy,
      reason: input.reason,
      status: DisputeStatus.OPEN,
      openedLedger: input.ledgerSequence,
    });

    logger.info(
      `[DisputeService] Dispute opened — disputeId=${input.disputeId} ` +
        `deliveryId=${input.deliveryId} openedBy=${input.openedBy}`,
    );

    await this.notify('dispute_opened', dispute);

    return dispute;
  }

  /**
   * Mark a dispute resolved on-chain.
   *
   * A resolution for a dispute this service has never seen is logged and
   * skipped rather than throwing — the same data-ordering tolerance used by
   * `reputationHandlers`, since indexers can observe events out of order.
   */
  async resolveDispute(input: DisputeResolvedInput): Promise<IDispute | null> {
    const dispute = await Dispute.findOne({ disputeId: input.disputeId });

    if (!dispute) {
      logger.warn(
        `[DisputeService] dispute_resolved: no local record for disputeId=${input.disputeId}, skipping`,
      );
      return null;
    }

    if (dispute.status === DisputeStatus.RESOLVED) {
      logger.warn(
        `[DisputeService] dispute_resolved: disputeId=${input.disputeId} already resolved, skipping`,
      );
      return dispute;
    }

    dispute.status = DisputeStatus.RESOLVED;
    dispute.resolution = input.resolution;
    dispute.resolvedLedger = input.ledgerSequence;
    dispute.resolvedAt = new Date();
    await dispute.save();

    logger.info(
      `[DisputeService] Dispute resolved — disputeId=${input.disputeId} ` +
        `resolution="${input.resolution ?? ''}"`,
    );

    await this.notify('dispute_resolved', dispute);

    return dispute;
  }

  async getDisputeById(disputeId: string): Promise<IDispute> {
    const dispute = await Dispute.findOne({ disputeId });
    if (!dispute) {
      throw new AppError('Dispute not found.', StatusCodes.NOT_FOUND);
    }
    return dispute;
  }

  async listDisputes(
    page: number,
    limit: number,
    status?: DisputeStatus,
  ): Promise<ListDisputesResult> {
    const skip = (page - 1) * limit;
    const filter = status ? { status } : {};

    const [data, total] = await Promise.all([
      Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Dispute.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const disputeService = new DisputeService();
