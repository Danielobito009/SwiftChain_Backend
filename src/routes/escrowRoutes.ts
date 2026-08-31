import { Router } from 'express';
import authenticate from '../middleware/authenticate';
import requireRole from '../middleware/requireRole';
import { listFlaggedEscrows, resolveFlaggedEscrow } from '../controllers/escrowController';
import { UserRole } from '../interfaces/IUser';

const router = Router();

// All escrow admin routes require a valid JWT AND the admin role
router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

/**
 * @route   GET /api/v1/admin/escrows/flagged
 * @desc    List escrows flagged as expired for admin review
 * @access  Admin only
 */
router.get('/flagged', listFlaggedEscrows);

/**
 * @route   PATCH /api/v1/admin/escrows/:id/resolve
 * @desc    Resolve a flagged (expired) escrow
 * @access  Admin only
 */
router.patch('/:id/resolve', resolveFlaggedEscrow);

export default router;
