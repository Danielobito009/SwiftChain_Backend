import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import { Evidence, IEvidence } from '../models/Evidence';
import { getStorageDriver } from './storage.service';
import env from '../config/env';
import AppError from '../utils/AppError';
import logger from '../config/logger';

// ─── Constraints ───────────────────────────────────────────────────────────────

/** MIME types accepted for dispute evidence uploads. */
export const ALLOWED_EVIDENCE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
] as const;

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface UploadEvidenceInput {
  disputeId: string;
  uploadedBy: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Validate, persist, and register a piece of dispute evidence.
 *
 * Business rules enforced here:
 *  - `disputeId` must be a well-formed ObjectId.
 *  - MIME type must be in the accepted allow-list.
 *  - File size must not exceed `UPLOAD_MAX_FILE_SIZE_MB`.
 *  - The file bytes are written to the configured storage driver (local disk
 *    or S3) before the metadata row is persisted, so a DB record never
 *    references a file that failed to upload.
 */
export const uploadEvidence = async (input: UploadEvidenceInput): Promise<IEvidence> => {
  const { disputeId, uploadedBy, originalName, mimeType, buffer, sizeBytes } = input;

  if (!mongoose.Types.ObjectId.isValid(disputeId)) {
    throw new AppError('Invalid disputeId format.', StatusCodes.BAD_REQUEST);
  }

  if (
    !ALLOWED_EVIDENCE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number])
  ) {
    throw new AppError(
      `Unsupported file type "${mimeType}". Allowed types: ${ALLOWED_EVIDENCE_MIME_TYPES.join(
        ', ',
      )}.`,
      StatusCodes.UNSUPPORTED_MEDIA_TYPE,
    );
  }

  const maxBytes = env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new AppError(
      `File exceeds the maximum allowed size of ${env.UPLOAD_MAX_FILE_SIZE_MB}MB.`,
      StatusCodes.REQUEST_TOO_LONG,
    );
  }

  const driver = getStorageDriver();
  const stored = await driver.upload(buffer, originalName, mimeType);

  const evidence = await Evidence.create({
    disputeId,
    uploadedBy,
    storageDriver: env.UPLOAD_STORAGE_DRIVER,
    storageKey: stored.key,
    url: stored.url,
    originalName,
    mimeType,
    sizeBytes,
  });

  logger.info(
    `[Evidence] Uploaded — disputeId=${disputeId} uploadedBy=${uploadedBy} ` +
      `key=${stored.key} sizeBytes=${sizeBytes}`,
  );

  return evidence;
};

/**
 * List evidence records linked to a dispute, newest first.
 */
export const getEvidenceForDispute = async (disputeId: string): Promise<IEvidence[]> => {
  if (!mongoose.Types.ObjectId.isValid(disputeId)) {
    throw new AppError('Invalid disputeId format.', StatusCodes.BAD_REQUEST);
  }

  return Evidence.find({ disputeId }).sort({ createdAt: -1 });
};
