import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { getIndexerLagStatus, listIndexerLagAlerts } from '../controllers/monitorController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// All monitoring routes require a valid JWT AND the admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

/**
 * @route   GET /api/v1/monitor/indexer-lag
 * @desc    Run an on-demand indexer-lag check against the live network ledger
 * @access  Admin only
 */
router.get('/indexer-lag', getIndexerLagStatus);

/**
 * @route   GET /api/v1/monitor/indexer-lag/alerts
 * @desc    List recent persisted indexer-lag alerts
 * @access  Admin only
 */
router.get('/indexer-lag/alerts', listIndexerLagAlerts);

export default router;
