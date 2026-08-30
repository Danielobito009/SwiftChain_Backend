import { Router } from 'express';
import { getUser, getUsers, reinstate, suspend, updateRole } from '../controllers/userController';
import { authenticate, authorize } from '../middlewares/auth';
import { buildQueryOptions } from '../middlewares/queryMiddleware';
import { QueryFeatureConfig } from '../types/query';

const router = Router();

/**
 * Query surface exposed by the users collection.
 *
 * Only these fields may be filtered, sorted or searched on, which keeps
 * unindexed and sensitive fields out of client-controlled queries.
 */
const userQueryConfig: QueryFeatureConfig = {
  sortableFields: ['createdAt', 'updatedAt', 'name', 'email', 'role', 'status'],
  filterableFields: {
    role: 'string',
    status: 'string',
    createdAt: 'date',
  },
  searchableFields: ['name', 'email'],
  defaultSort: { createdAt: -1 },
  defaultLimit: 20,
  maxLimit: 100,
};

// Every user route requires authentication.
router.use(authenticate);

/**
 * @route   GET /api/v1/users
 * @desc    List users with pagination, sorting and filtering
 * @access  Admin
 */
router.get('/', authorize('admin'), buildQueryOptions(userQueryConfig), getUsers);

/**
 * @route   GET /api/v1/users/:userId
 * @desc    Retrieve a single user
 * @access  Admin
 */
router.get('/:userId', authorize('admin'), getUser);

/**
 * @route   PATCH /api/v1/users/:userId/suspend
 * @desc    Suspend a user account (audited)
 * @access  Admin
 */
router.patch('/:userId/suspend', authorize('admin'), suspend);

/**
 * @route   PATCH /api/v1/users/:userId/reinstate
 * @desc    Reinstate a suspended user account (audited)
 * @access  Admin
 */
router.patch('/:userId/reinstate', authorize('admin'), reinstate);

/**
 * @route   PATCH /api/v1/users/:userId/role
 * @desc    Change a user's role (audited)
 * @access  Admin
 */
router.patch('/:userId/role', authorize('admin'), updateRole);

export default router;
