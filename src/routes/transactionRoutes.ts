import { Router } from 'express';
import { transactionController } from '../controllers/transactionController';
import { validateRequest } from '../middlewares/validateRequest';
import { apiLimiter } from '../middlewares/rateLimiter';
import { escrowLockTransactionSchema } from '../validators/transactionValidator';

/**
 * Transaction-building routes.
 *
 * Mounted at /api/v1/transactions by the root router.
 *
 * Endpoints:
 *   POST /api/v1/transactions/escrow-lock — unsigned escrow-lock XDR
 */
const router = Router();

/**
 * @route  POST /api/v1/transactions/escrow-lock
 * @desc   Build an unsigned Soroban XDR that locks a delivery's escrow amount
 * @access Public
 */
router.post(
  '/escrow-lock',
  apiLimiter,
  validateRequest({ body: escrowLockTransactionSchema }),
  transactionController.createEscrowLockTransaction.bind(transactionController),
);

export default router;
