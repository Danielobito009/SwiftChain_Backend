import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import {
  createFleet,
  inviteDriver,
  respondToInvitation,
  getFleetMetrics,
} from '../controllers/fleetController';
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

/**
 * @route   POST /api/v1/fleets/:id/invite
 * @desc    Invite a driver to join the fleet
 * @access  Enterprise only (must be the fleet owner)
 */
router.post('/:id/invite', requireRole(UserRole.ENTERPRISE), inviteDriver);

/**
 * @route   PATCH /api/v1/fleets/invitations/:invitationId
 * @desc    Driver accepts or declines a pending fleet invitation
 * @access  Driver only
 */
router.patch('/invitations/:invitationId', requireRole(UserRole.DRIVER), respondToInvitation);

/**
 * @route   GET /api/v1/fleets/:id/metrics
 * @desc    Aggregated delivery and revenue statistics for a fleet
 * @access  Enterprise only (must be the fleet owner)
 */
router.get('/:id/metrics', requireRole(UserRole.ENTERPRISE), getFleetMetrics);

export default router;
