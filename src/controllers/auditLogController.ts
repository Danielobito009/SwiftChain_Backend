import { StatusCodes } from 'http-status-codes';
import { Types } from 'mongoose';
import asyncHandler from '../utils/asyncHandler';
import { resolveQueryOptions } from '../middlewares/queryMiddleware';
import { listAuditLogs, listLogsForTarget } from '../services/auditLogService';
import { AUDIT_TARGET_TYPES, AuditTargetType } from '../models/AuditLog';
import ApiError from '../utils/ApiError';

/**
 * GET /api/v1/audit-logs
 *
 * Returns a paginated view of the administrative audit trail. Restricted to
 * admins by the route-level authorization guard.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { items, meta } = await listAuditLogs(resolveQueryOptions(req));

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Audit logs retrieved successfully',
    data: items,
    meta,
  });
});

/**
 * GET /api/v1/audit-logs/:targetType/:targetId
 *
 * Returns the full audit trail for one record, newest first.
 */
export const getAuditLogsForTarget = asyncHandler(async (req, res) => {
  const { targetType, targetId } = req.params;

  if (!AUDIT_TARGET_TYPES.includes(targetType as AuditTargetType)) {
    throw ApiError.badRequest(`\`targetType\` must be one of: ${AUDIT_TARGET_TYPES.join(', ')}`);
  }

  if (!Types.ObjectId.isValid(targetId)) {
    throw ApiError.badRequest('The supplied target id is not a valid identifier');
  }

  const { items, meta } = await listLogsForTarget(
    targetType as AuditTargetType,
    targetId,
    resolveQueryOptions(req),
  );

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Audit logs retrieved successfully',
    data: items,
    meta,
  });
});

export default { getAuditLogs, getAuditLogsForTarget };
