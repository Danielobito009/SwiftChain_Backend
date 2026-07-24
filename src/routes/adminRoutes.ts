import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { suspendUser } from '../controllers/adminController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// All admin routes require a valid JWT AND the admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

/**
 * @route   PUT /api/v1/admin/users/:id/suspend
 * @desc    Suspend or ban a user / driver account
 * @access  Admin only
 */
router.put('/users/:id/suspend', suspendUser);

export default router;
