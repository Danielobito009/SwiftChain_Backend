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

export default router;
