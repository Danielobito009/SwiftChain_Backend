import { Router } from 'express';
import multer from 'multer';
import { StatusCodes } from 'http-status-codes';
import authenticate from '../middleware/authenticate';
import { uploadEvidenceHandler, listEvidenceHandler } from '../controllers/uploadController';
import env from '../config/env';
import { ALLOWED_EVIDENCE_MIME_TYPES } from '../services/evidenceService';
import AppError from '../utils/AppError';

const router = Router();

// Files are buffered in memory and handed to the storage driver (local disk
// or S3) inside the service layer — nothing is written to disk by multer
// itself, so the local-storage driver stays the single place that touches
// the filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      !ALLOWED_EVIDENCE_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_EVIDENCE_MIME_TYPES)[number],
      )
    ) {
      cb(
        new AppError(
          `Unsupported file type "${file.mimetype}".`,
          StatusCodes.UNSUPPORTED_MEDIA_TYPE,
        ),
      );
      return;
    }
    cb(null, true);
  },
});

router.use(authenticate);

/**
 * @route   POST /api/v1/uploads/evidence
 * @desc    Upload a piece of media evidence for a delivery dispute
 * @access  Authenticated users
 */
router.post('/evidence', upload.single('file'), uploadEvidenceHandler);

/**
 * @route   GET /api/v1/uploads/evidence/:disputeId
 * @desc    List evidence records linked to a dispute
 * @access  Authenticated users
 */
router.get('/evidence/:disputeId', listEvidenceHandler);

export default router;
