import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import validate from '../middleware/validate';
import {
  openDispute,
  getDispute,
  listDisputes,
  resolveDisputeController,
  addEvidenceController,
  updateDisputeController,
} from '../controllers/disputeController';
import {
  createDisputeSchema,
  resolveDisputeSchema,
  addEvidenceSchema,
  updateDisputeSchema,
} from '../validators/disputeValidator';

const router = Router();

/**
 * @route   POST /api/v1/disputes
 * @desc    Open a delivery dispute before any on-chain dispute workflow runs
 * @access  Authenticated users (delivery customer or driver)
 */
router.post('/', authenticate, validate(createDisputeSchema), openDispute);

/**
 * @route   GET /api/v1/disputes
 * @desc    List disputes with optional filtering
 * @access  Authenticated users
 */
router.get('/', authenticate, listDisputes);

/**
 * @route   GET /api/v1/disputes/:id
 * @desc    Get a single dispute by ID
 * @access  Authenticated users
 */
router.get('/:id', authenticate, getDispute);

/**
 * @route   PATCH /api/v1/disputes/:id/evidence
 * @desc    Add evidence URLs to an open dispute
 * @access  Authenticated users (dispute raiser or driver)
 */
router.patch(
  '/:id/evidence',
  authenticate,
  validate(addEvidenceSchema),
  addEvidenceController,
);

/**
 * @route   PATCH /api/v1/disputes/:id/resolve
 * @desc    Resolve or reject a dispute with resolution notes
 * @access  Authenticated users (admin or dispute participant)
 */
router.patch(
  '/:id/resolve',
  authenticate,
  validate(resolveDisputeSchema),
  resolveDisputeController,
);

/**
 * @route   PATCH /api/v1/disputes/:id
 * @desc    Update dispute metadata (reason, description, evidence)
 * @access  Authenticated users (dispute raiser or admin)
 */
router.patch(
  '/:id',
  authenticate,
  validate(updateDisputeSchema),
  updateDisputeController,
);

export default router;
