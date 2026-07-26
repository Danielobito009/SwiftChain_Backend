import { Router } from 'express';
import { driverController } from '../controllers/driverController';

const router = Router();

/**
 * @route  GET /api/v1/drivers/leaderboard
 * @desc   Fetch top drivers ranked by reputation points
 * @access Public
 */
router.get('/leaderboard', driverController.getLeaderboard.bind(driverController));

export default router;
