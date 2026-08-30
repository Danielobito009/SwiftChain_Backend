import { Request } from 'express';
import { Types } from 'mongoose';
import AuditLog, {
  AuditAction,
  AuditStatus,
  AuditTargetType,
  IAuditLogDocument,
} from '../models/AuditLog';
import logger from '../config/logger';
import { PaginatedResult, QueryOptions } from '../types/query';
import { buildPaginationMeta } from '../middlewares/queryMiddleware';

/** Everything needed to write one audit entry. */
export interface RecordAuditInput {
  adminId: string | Types.ObjectId;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | Types.ObjectId;
  status?: AuditStatus;
  reason?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extracts the request-scoped forensic context attached to every entry.
 *
 * Kept separate from the caller's domain arguments so controllers only pass
 * the request through rather than unpacking headers themselves.
 */
export const extractRequestContext = (
  req: Request,
): Pick<RecordAuditInput, 'ipAddress' | 'userAgent'> => ({
  ipAddress: req.ip,
  userAgent: req.get('user-agent') ?? undefined,
});

/**
 * Persists a single audit entry.
 *
 * @throws when the entry cannot be written, so that callers performing a
 * privileged action inside a transaction can abort it.
 */
export const recordAction = async (input: RecordAuditInput): Promise<IAuditLogDocument> =>
  AuditLog.create({
    admin: new Types.ObjectId(input.adminId),
    action: input.action,
    targetType: input.targetType,
    targetId: new Types.ObjectId(input.targetId),
    status: input.status ?? 'success',
    reason: input.reason,
    changes: input.changes,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

/**
 * Records an audit entry without propagating write failures.
 *
 * Used on paths where the privileged action has already been committed: at
 * that point failing the whole request would misreport the outcome to the
 * caller, so the failure is logged loudly for operators instead.
 */
export const recordActionSafely = async (input: RecordAuditInput): Promise<void> => {
  try {
    await recordAction(input);
  } catch (error) {
    logger.error(
      `Failed to write audit log for action "${input.action}" on ` +
        `${input.targetType}:${String(input.targetId)}`,
      error,
    );
  }
};

/**
 * Returns a page of audit entries matching the supplied query options.
 *
 * The count and the page are issued concurrently because they are independent
 * reads against the same filter.
 */
export const listAuditLogs = async (
  options: QueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const [items, totalItems] = await Promise.all([
    AuditLog.find(options.filter)
      .populate('admin', 'name email role')
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean({ virtuals: true })
      .exec(),
    AuditLog.countDocuments(options.filter).exec(),
  ]);

  return {
    items: items as unknown as Record<string, unknown>[],
    meta: buildPaginationMeta(totalItems, options.page, options.limit),
  };
};

/** Returns the full audit trail for one target record, newest first. */
export const listLogsForTarget = async (
  targetType: AuditTargetType,
  targetId: string,
  options: QueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const filter = { ...options.filter, targetType, targetId: new Types.ObjectId(targetId) };

  const [items, totalItems] = await Promise.all([
    AuditLog.find(filter)
      .populate('admin', 'name email role')
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean({ virtuals: true })
      .exec(),
    AuditLog.countDocuments(filter).exec(),
  ]);

  return {
    items: items as unknown as Record<string, unknown>[],
    meta: buildPaginationMeta(totalItems, options.page, options.limit),
  };
};

export default {
  recordAction,
  recordActionSafely,
  listAuditLogs,
  listLogsForTarget,
  extractRequestContext,
};
