import { Router } from 'express';
import { getAuditLogs, getAuditLogsForTarget } from '../controllers/auditLogController';
import { authenticate, authorize } from '../middlewares/auth';
import { buildQueryOptions } from '../middlewares/queryMiddleware';
import { QueryFeatureConfig } from '../types/query';

const router = Router();

const auditLogQueryConfig: QueryFeatureConfig = {
  sortableFields: ['createdAt', 'action', 'targetType', 'status'],
  filterableFields: {
    action: 'string',
    targetType: 'string',
    status: 'string',
    admin: 'objectId',
    targetId: 'objectId',
    createdAt: 'date',
  },
  defaultSort: { createdAt: -1 },
  defaultLimit: 25,
  maxLimit: 100,
};

// The audit trail records privileged activity, so it is admin-only.
router.use(authenticate, authorize('admin'));

/**
 * @route   GET /api/v1/audit-logs
 * @desc    List audit entries with pagination, sorting and filtering
 * @access  Admin
 */
router.get('/', buildQueryOptions(auditLogQueryConfig), getAuditLogs);

/**
 * @route   GET /api/v1/audit-logs/:targetType/:targetId
 * @desc    Retrieve the audit trail for a single record
 * @access  Admin
 */
router.get('/:targetType/:targetId', buildQueryOptions(auditLogQueryConfig), getAuditLogsForTarget);

export default router;
