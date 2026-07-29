import { Schema, model, Document } from 'mongoose';

/**
 * Persisted record of a single indexer-lag threshold breach.
 *
 * Written by `monitorService` every time the gap between the indexer's
 * processed ledger and the live network ledger exceeds
 * `INDEXER_LAG_ALERT_THRESHOLD`, giving admins a durable audit trail
 * independent of log retention.
 */
export interface IIndexerAlert extends Document {
  network: string;

  /** Ledger sequence the indexer had processed up to at alert time. */
  processedLedger: number;

  /** Live network ledger sequence at alert time. */
  networkLedger: number;

  /** networkLedger - processedLedger. */
  lagLedgers: number;

  /** Threshold that was breached to trigger this alert. */
  thresholdLedgers: number;

  /** Whether a webhook notification was configured for this alert. */
  webhookConfigured: boolean;

  /** Whether the webhook notification was delivered successfully. */
  webhookNotified: boolean;

  /** Error message if the webhook delivery failed. */
  webhookError?: string;

  createdAt: Date;
  updatedAt: Date;
}

const IndexerAlertSchema = new Schema<IIndexerAlert>(
  {
    network: {
      type: String,
      required: true,
      index: true,
    },

    processedLedger: {
      type: Number,
      required: true,
      min: 0,
    },

    networkLedger: {
      type: Number,
      required: true,
      min: 0,
    },

    lagLedgers: {
      type: Number,
      required: true,
      min: 0,
    },

    thresholdLedgers: {
      type: Number,
      required: true,
      min: 1,
    },

    webhookConfigured: {
      type: Boolean,
      required: true,
      default: false,
    },

    webhookNotified: {
      type: Boolean,
      required: true,
      default: false,
    },

    webhookError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Most recent alerts first, scoped by network.
IndexerAlertSchema.index({ network: 1, createdAt: -1 });

export const IndexerAlert = model<IIndexerAlert>('IndexerAlert', IndexerAlertSchema);
