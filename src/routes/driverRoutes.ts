import { Router } from 'express';
import { driverController } from '../controllers/driverController';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { UserRole } from '../interfaces/IUser';

const router = Router();

/**
 * @route  GET /api/v1/drivers/leaderboard
 * @desc   Fetch top drivers ranked by reputation points
 * @access Public
 */
router.get('/leaderboard', driverController.getLeaderboard.bind(driverController));

/**
 * @route  PATCH /api/v1/drivers/me/vehicle
 * @desc   Create or update the authenticated driver's vehicle details
 * @access Driver only
 */
router.patch(
  '/me/vehicle',
  authenticate,
  requireRole(UserRole.DRIVER),
  driverController.setVehicleDetails.bind(driverController),
);

export default router;
