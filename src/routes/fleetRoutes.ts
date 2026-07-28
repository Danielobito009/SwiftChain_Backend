import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { createFleet } from '../controllers/fleetController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// All fleet routes require a valid JWT.
router.use(authenticate);

/**
 * @route   POST /api/v1/fleets
 * @desc    Create a new fleet
 * @access  Enterprise only
 */
router.post('/', requireRole(UserRole.ENTERPRISE), createFleet);

export default router;
