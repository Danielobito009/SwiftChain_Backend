import { Schema, model, Document } from 'mongoose';

/**
 * Tracks how far the indexer has processed the Soroban event stream for a
 * given network. A single document per `network` acts as the durable
 * checkpoint that `monitorService` compares against the live network ledger
 * to detect indexer lag.
 */
export interface IIndexerStatus extends Document {
  /** Network alias this checkpoint belongs to (e.g. "testnet", "mainnet"). */
  network: string;

  /** Highest ledger sequence the indexer has fully processed. */
  lastProcessedLedger: number;

  /** When `lastProcessedLedger` was last advanced. */
  lastProcessedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const IndexerStatusSchema = new Schema<IIndexerStatus>(
  {
    network: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    lastProcessedLedger: {
      type: Number,
      required: true,
      min: 0,
    },

    lastProcessedAt: {
      type: Date,
      required: true,
      default: (): Date => new Date(),
    },
  },
  {
    timestamps: true,
  },
);

export const IndexerStatus = model<IIndexerStatus>('IndexerStatus', IndexerStatusSchema);
