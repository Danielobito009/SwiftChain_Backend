import mongoose, { Schema, Document } from 'mongoose';

/**
 * Represents the last processed ledger position for a given event type
 * and contract combination. Used by the event poller to resume from
 * where it left off after restarts.
 */
export interface IEventLog extends Document {
  /** Logical event type (e.g. "escrow_funded", "reputation_increased"). */
  eventType: string;
  /** Soroban contract ID that emits the event. */
  contractId: string;
  /** Last ledger sequence number that was successfully processed. */
  lastProcessedLedger: number;
  /** Opaque cursor returned by `getEvents` for resuming mid-pagination. */
  cursor?: string;
  /** Timestamp of the last successful poll cycle. */
  updatedAt: Date;
  createdAt: Date;
}

const EventLogSchema = new Schema<IEventLog>(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    contractId: {
      type: String,
      required: true,
      trim: true,
    },
    lastProcessedLedger: {
      type: Number,
      required: true,
      min: 1,
    },
    cursor: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Each (eventType, contractId) pair can have at most one cursor/ledger
 * position so the poller always knows exactly where to resume.
 */
EventLogSchema.index({ eventType: 1, contractId: 1 }, { unique: true });

const EventLog = mongoose.model<IEventLog>('EventLog', EventLogSchema);

export default EventLog;
export { EventLog };

