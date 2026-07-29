import { Schema, model, Document, Types } from 'mongoose';

/**
 * Storage backend a given piece of evidence was persisted to.
 */
export type EvidenceStorageDriver = 'local' | 's3';

/**
 * Persisted metadata for a single piece of media evidence uploaded in
 * connection with a delivery dispute.
 */
export interface IEvidence extends Document {
  /** Dispute this evidence supports. Not enforced with `ref` validation —
   *  dispute records are managed by a separate subsystem. */
  disputeId: Types.ObjectId;

  /** User who uploaded the file. */
  uploadedBy: Types.ObjectId;

  /** Storage backend the file bytes were written to. */
  storageDriver: EvidenceStorageDriver;

  /** Backend-specific object key (S3 key or local relative path). */
  storageKey: string;

  /** Secure URL clients use to retrieve the file. */
  url: string;

  /** Original filename supplied by the uploader. */
  originalName: string;

  /** MIME type reported by the client and verified against the allow-list. */
  mimeType: string;

  /** File size in bytes. */
  sizeBytes: number;

  createdAt: Date;
  updatedAt: Date;
}

const EvidenceSchema = new Schema<IEvidence>(
  {
    disputeId: {
      type: Schema.Types.ObjectId,
      required: [true, 'disputeId is required'],
      index: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'uploadedBy is required'],
    },

    storageDriver: {
      type: String,
      enum: ['local', 's3'],
      required: true,
    },

    storageKey: {
      type: String,
      required: true,
    },

    url: {
      type: String,
      required: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    timestamps: true,
  },
);

EvidenceSchema.index({ disputeId: 1, createdAt: -1 });

export const Evidence = model<IEvidence>('Evidence', EvidenceSchema);
