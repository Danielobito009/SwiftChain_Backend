import { Router } from 'express';
import disputeController from '../controllers/disputeController';

const router = Router();

// Lock an escrow and create a dispute (admin only)
router.post('/:escrowId/lock', disputeController.lockEscrow.bind(disputeController));

// Resolve a dispute (refund buyer or release to driver)
router.post('/:disputeId/resolve', disputeController.resolveDispute.bind(disputeController));

// Get dispute details
router.get('/:disputeId', disputeController.getDispute.bind(disputeController));

export default router;
