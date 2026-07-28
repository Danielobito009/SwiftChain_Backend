import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import validate from '../middleware/validate';
import { openDispute } from '../controllers/disputeController';
import { createDisputeSchema } from '../validators/disputeValidator';

const router = Router();

/**
 * @route   POST /api/v1/disputes
 * @desc    Open a delivery dispute before any on-chain dispute workflow runs
 * @access  Authenticated users (delivery customer or driver)
 */
router.post('/', authenticate, validate(createDisputeSchema), openDispute);

export default router;
