import { Types } from 'mongoose';
import User, { IUserDocument, UserRole, UserStatus } from '../models/User';
import ApiError from '../utils/ApiError';
import { PaginatedResult, QueryOptions } from '../types/query';
import { buildPaginationMeta } from '../middlewares/queryMiddleware';
import { RecordAuditInput, recordAction } from './auditLogService';

/** Context describing who performed a privileged action and from where. */
export interface AdminActionContext {
  adminId: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/** Loads a user by id, rejecting malformed ids before touching the database. */
const findUserOrFail = async (userId: string): Promise<IUserDocument> => {
  if (!Types.ObjectId.isValid(userId)) {
    throw ApiError.badRequest('The supplied user id is not a valid identifier');
  }

  const user = await User.findById(userId).exec();
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

/**
 * Returns a page of users using the options produced by the query middleware.
 */
export const listUsers = async (
  options: QueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const [items, totalItems] = await Promise.all([
    User.find(options.filter)
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean({ virtuals: true })
      .exec(),
    User.countDocuments(options.filter).exec(),
  ]);

  return {
    items: items as unknown as Record<string, unknown>[],
    meta: buildPaginationMeta(totalItems, options.page, options.limit),
  };
};

/** Returns a single user by id. */
export const getUserById = async (userId: string): Promise<Record<string, unknown>> => {
  const user = await findUserOrFail(userId);
  return user.toJSON();
};

/**
 * Applies a status change and writes the audit entry in the same step.
 *
 * The audit entry is written before the change is persisted: if the audit
 * write fails the action is abandoned, which guarantees no privileged change
 * ever lands without a corresponding record.
 */
const applyAuditedChange = async <T>(
  user: IUserDocument,
  audit: Omit<RecordAuditInput, 'targetType' | 'targetId'>,
  mutate: () => void,
  project: (user: IUserDocument) => T,
): Promise<T> => {
  await recordAction({
    ...audit,
    targetType: 'User',
    targetId: user.id as string,
  });

  mutate();
  await user.save();

  return project(user);
};

/** Suspends an account, blocking further authenticated access. */
export const suspendUser = async (
  userId: string,
  context: AdminActionContext,
): Promise<Record<string, unknown>> => {
  const user = await findUserOrFail(userId);

  if (user.id === context.adminId) {
    throw ApiError.badRequest('Administrators cannot suspend their own account');
  }

  if (user.status === 'suspended') {
    throw ApiError.conflict('This user is already suspended');
  }

  return applyAuditedChange(
    user,
    {
      adminId: context.adminId,
      action: 'user.suspended',
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      changes: { status: { from: user.status, to: 'suspended' satisfies UserStatus } },
    },
    () => {
      user.status = 'suspended';
    },
    (updated) => updated.toJSON(),
  );
};

/** Restores a suspended account to active status. */
export const reinstateUser = async (
  userId: string,
  context: AdminActionContext,
): Promise<Record<string, unknown>> => {
  const user = await findUserOrFail(userId);

  if (user.status === 'active') {
    throw ApiError.conflict('This user is already active');
  }

  return applyAuditedChange(
    user,
    {
      adminId: context.adminId,
      action: 'user.reinstated',
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      changes: { status: { from: user.status, to: 'active' satisfies UserStatus } },
    },
    () => {
      user.status = 'active';
    },
    (updated) => updated.toJSON(),
  );
};

/** Changes a user's role, recording the previous and new value. */
export const changeUserRole = async (
  userId: string,
  role: UserRole,
  context: AdminActionContext,
): Promise<Record<string, unknown>> => {
  const user = await findUserOrFail(userId);

  if (user.role === role) {
    throw ApiError.conflict(`This user already has the "${role}" role`);
  }

  if (user.id === context.adminId) {
    throw ApiError.badRequest('Administrators cannot change their own role');
  }

  const previousRole = user.role;

  return applyAuditedChange(
    user,
    {
      adminId: context.adminId,
      action: 'user.role_changed',
      reason: context.reason,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      changes: { role: { from: previousRole, to: role } },
    },
    () => {
      user.role = role;
    },
    (updated) => updated.toJSON(),
  );
};

export default {
  listUsers,
  getUserById,
  suspendUser,
  reinstateUser,
  changeUserRole,
};
