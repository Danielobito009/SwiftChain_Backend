import { Router } from 'express';
import { getEscrow, getEscrows, refund, release } from '../controllers/escrowController';
import { authenticate, authorize } from '../middlewares/auth';
import { escrowLimiter, escrowMutationLimiter } from '../middlewares/rateLimiter';
import { buildQueryOptions } from '../middlewares/queryMiddleware';
import { QueryFeatureConfig } from '../types/query';

const router = Router();

const escrowQueryConfig: QueryFeatureConfig = {
  sortableFields: ['createdAt', 'updatedAt', 'amount', 'status'],
  filterableFields: {
    status: 'string',
    currency: 'string',
    amount: 'number',
    payer: 'objectId',
    payee: 'objectId',
    delivery: 'objectId',
    createdAt: 'date',
  },
  defaultSort: { createdAt: -1 },
  defaultLimit: 20,
  maxLimit: 100,
};

// Escrow endpoints move funds, so the whole router is authenticated and
// rate limited before any handler runs.
router.use(authenticate);
router.use(escrowLimiter);

/**
 * @route   GET /api/v1/escrows
 * @desc    List escrow records with pagination, sorting and filtering
 * @access  Authenticated
 */
router.get('/', buildQueryOptions(escrowQueryConfig), getEscrows);

/**
 * @route   GET /api/v1/escrows/:escrowId
 * @desc    Retrieve a single escrow record
 * @access  Authenticated
 */
router.get('/:escrowId', getEscrow);

/**
 * @route   POST /api/v1/escrows/:escrowId/refund
 * @desc    Refund a held escrow to the payer (audited)
 * @access  Admin (strictly rate limited)
 */
router.post('/:escrowId/refund', authorize('admin'), escrowMutationLimiter, refund);

/**
 * @route   POST /api/v1/escrows/:escrowId/release
 * @desc    Release a held escrow to the payee (audited)
 * @access  Admin (strictly rate limited)
 */
router.post('/:escrowId/release', authorize('admin'), escrowMutationLimiter, release);

export default router;
