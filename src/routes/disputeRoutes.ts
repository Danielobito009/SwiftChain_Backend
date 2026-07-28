import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { disputeController } from '../controllers/disputeController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// Dispute records mirror on-chain state across all users; scope read access
// to admins until per-user ownership filtering is implemented.
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

/**
 * @route   GET /api/v1/disputes
 * @desc    List disputes synced from on-chain events
 * @access  Admin only
 */
router.get('/', disputeController.listDisputes.bind(disputeController));

/**
 * @route   GET /api/v1/disputes/:disputeId
 * @desc    Fetch a single dispute by its on-chain disputeId
 * @access  Admin only
 */
router.get('/:disputeId', disputeController.getDispute.bind(disputeController));

export default router;
