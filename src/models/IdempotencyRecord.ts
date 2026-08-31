import mongoose, { Schema, Document } from 'mongoose';

/**
 * Persistence state of an idempotent request.
 *
 * - `processing` — the original request is still in-flight.  Concurrent
 *   duplicates that arrive while the first request is processing receive a
 *   409 Conflict so the caller knows to retry later.
 * - `completed`  — the original request finished successfully.  Duplicates
 *   receive the cached response body directly.
 * - `failed`     — the original request ended in an error.  Duplicates
 *   receive the cached error response.
 */
export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

export interface IIdempotencyRecord extends Document {
  /** The value of the `Idempotency-Key` request header, scoped to a route. */
  key: string;
  /** Namespaces the key so the same UUID is safe to reuse across endpoints. */
  endpoint: string;
  /** Current lifecycle state of the original request. */
  status: IdempotencyStatus;
  /** HTTP status code to replay for duplicate requests (set on completion). */
  responseStatus?: number;
  /** Serialised JSON body to replay for duplicate requests (set on completion). */
  responseBody?: Record<string, unknown>;
  /** TTL marker — the document is removed by the MongoDB TTL index after this date. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const IdempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    endpoint: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'] as IdempotencyStatus[],
      required: true,
      default: 'processing',
    },
    responseStatus: {
      type: Number,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// Composite unique index: the same key is allowed on different endpoints.
IdempotencyRecordSchema.index({ key: 1, endpoint: 1 }, { unique: true });

// TTL index: MongoDB automatically purges expired records.
IdempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const IdempotencyRecord = mongoose.model<IIdempotencyRecord>(
  'IdempotencyRecord',
  IdempotencyRecordSchema,
);

export default IdempotencyRecord;
