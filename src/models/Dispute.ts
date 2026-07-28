import { Schema, model, Document } from 'mongoose';

export enum DisputeStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
}

/**
 * Local mirror of a dispute lifecycle tracked on the SwiftChain Soroban
 * contract. Rows are created/updated exclusively by `disputeHandlers` as
 * on-chain events are indexed — this is a read model, not a source of truth.
 */
export interface IDispute extends Document {
  /** On-chain dispute identifier (unique per contract). */
  disputeId: string;

  /** Business identifier of the delivery this dispute concerns. */
  deliveryId: string;

  /** Stellar account address of the party who opened the dispute. */
  openedBy: string;

  /** Free-form reason supplied when the dispute was opened. */
  reason?: string;

  status: DisputeStatus;

  /** Free-form resolution outcome supplied when the dispute was resolved. */
  resolution?: string;

  /** Ledger sequence at which the dispute was opened on-chain. */
  openedLedger: number;

  /** Ledger sequence at which the dispute was resolved on-chain. */
  resolvedLedger?: number;

  resolvedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const DisputeSchema = new Schema<IDispute>(
  {
    disputeId: {
      type: String,
      required: [true, 'disputeId is required'],
      unique: true,
      index: true,
    },

    deliveryId: {
      type: String,
      required: [true, 'deliveryId is required'],
      index: true,
    },

    openedBy: {
      type: String,
      required: [true, 'openedBy is required'],
    },

    reason: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
      index: true,
    },

    resolution: {
      type: String,
      default: null,
    },

    openedLedger: {
      type: Number,
      required: true,
    },

    resolvedLedger: {
      type: Number,
      default: null,
    },

    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

DisputeSchema.index({ deliveryId: 1, createdAt: -1 });

export const Dispute = model<IDispute>('Dispute', DisputeSchema);
