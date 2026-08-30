import { StatusCodes } from 'http-status-codes';
import asyncHandler from '../utils/asyncHandler';
import { resolveQueryOptions } from '../middlewares/queryMiddleware';
import {
  changeUserRole,
  getUserById,
  listUsers,
  reinstateUser,
  suspendUser,
} from '../services/userService';
import { validateActionReason, validateRoleChangeInput } from '../validators/adminValidator';
import ApiError from '../utils/ApiError';

/** Reads the authenticated admin id, guarding against an unprotected mount. */
const requireAdminId = (userId: string | undefined): string => {
  if (!userId) {
    throw ApiError.unauthorized('Authentication is required');
  }
  return userId;
};

/**
 * GET /api/v1/users
 *
 * Returns a paginated, sortable and filterable list of users. The query
 * string is parsed by `buildQueryOptions` before this handler runs.
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await listUsers(resolveQueryOptions(req));

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Users retrieved successfully',
    data: items,
    meta,
  });
});

/** GET /api/v1/users/:userId */
export const getUser = asyncHandler(async (req, res) => {
  const user = await getUserById(req.params.userId);

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'User retrieved successfully',
    data: user,
  });
});

/**
 * PATCH /api/v1/users/:userId/suspend
 *
 * Suspends an account. The action is written to the audit log before the
 * change is persisted.
 */
export const suspend = asyncHandler(async (req, res) => {
  const user = await suspendUser(req.params.userId, {
    adminId: requireAdminId(req.user?.id),
    reason: validateActionReason(req.body),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'User suspended successfully',
    data: user,
  });
});

/** PATCH /api/v1/users/:userId/reinstate */
export const reinstate = asyncHandler(async (req, res) => {
  const user = await reinstateUser(req.params.userId, {
    adminId: requireAdminId(req.user?.id),
    reason: validateActionReason(req.body),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'User reinstated successfully',
    data: user,
  });
});

/** PATCH /api/v1/users/:userId/role */
export const updateRole = asyncHandler(async (req, res) => {
  const { role, reason } = validateRoleChangeInput(req.body);

  const user = await changeUserRole(req.params.userId, role, {
    adminId: requireAdminId(req.user?.id),
    reason,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'User role updated successfully',
    data: user,
  });
});

export default { getUsers, getUser, suspend, reinstate, updateRole };
