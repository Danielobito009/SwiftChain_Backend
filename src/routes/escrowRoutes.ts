import { Router } from 'express';
import { escrowController } from '../controllers/escrowController';
import { validateRequest } from '../middlewares/validateRequest';
import { apiLimiter } from '../middlewares/rateLimiter';
import { escrowByDeliveryParamsSchema } from '../validators/escrowValidator';

/**
 * Escrow routes.
 *
 * Mounted at /api/v1/escrow by the root router.
 *
 * Endpoints:
 *   GET /api/v1/escrow/delivery/:id — escrow state for a specific delivery
 */
const router = Router();

/**
 * @route  GET /api/v1/escrow/delivery/:id
 * @desc   Fetch the escrow record associated with a delivery
 * @access Public
 */
router.get(
  '/delivery/:id',
  apiLimiter,
  validateRequest({ params: escrowByDeliveryParamsSchema }),
  escrowController.getEscrowByDelivery.bind(escrowController),
);
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { listFlaggedEscrows, resolveFlaggedEscrow } from '../controllers/escrowController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// All escrow admin routes require a valid JWT AND the admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

/**
 * @route   GET /api/v1/admin/escrows/flagged
 * @desc    List escrows flagged as expired for admin review
 * @access  Admin only
 */
router.get('/flagged', listFlaggedEscrows);

/**
 * @route   PATCH /api/v1/admin/escrows/:id/resolve
 * @desc    Resolve a flagged (expired) escrow
 * @access  Admin only
 */
router.patch('/:id/resolve', resolveFlaggedEscrow);

export default router;
