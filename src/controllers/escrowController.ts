import { StatusCodes } from 'http-status-codes';
import asyncHandler from '../utils/asyncHandler';
import { resolveQueryOptions } from '../middlewares/queryMiddleware';
import { getEscrowById, listEscrows, refundEscrow, releaseEscrow } from '../services/escrowService';
import { validateActionReason } from '../validators/adminValidator';
import ApiError from '../utils/ApiError';

/** Reads the authenticated admin id, guarding against an unprotected mount. */
const requireAdminId = (userId: string | undefined): string => {
  if (!userId) {
    throw ApiError.unauthorized('Authentication is required');
  }
  return userId;
};

/** GET /api/v1/escrows */
export const getEscrows = asyncHandler(async (req, res) => {
  const { items, meta } = await listEscrows(resolveQueryOptions(req));

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Escrows retrieved successfully',
    data: items,
    meta,
  });
});

/** GET /api/v1/escrows/:escrowId */
export const getEscrow = asyncHandler(async (req, res) => {
  const escrow = await getEscrowById(req.params.escrowId);

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Escrow retrieved successfully',
    data: escrow,
  });
});

/**
 * POST /api/v1/escrows/:escrowId/refund
 *
 * Refunds a held escrow to the payer. Guarded by the strict escrow mutation
 * rate limiter and recorded in the audit log.
 */
export const refund = asyncHandler(async (req, res) => {
  const escrow = await refundEscrow(req.params.escrowId, {
    adminId: requireAdminId(req.user?.id),
    reason: validateActionReason(req.body),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Escrow refunded successfully',
    data: escrow,
  });
});

/**
 * POST /api/v1/escrows/:escrowId/release
 *
 * Releases a held escrow to the payee. Guarded by the strict escrow mutation
 * rate limiter and recorded in the audit log.
 */
export const release = asyncHandler(async (req, res) => {
  const escrow = await releaseEscrow(req.params.escrowId, {
    adminId: requireAdminId(req.user?.id),
    reason: validateActionReason(req.body),
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(StatusCodes.OK).json({
    status: 'success',
    message: 'Escrow released successfully',
    data: escrow,
  });
});

export default { getEscrows, getEscrow, refund, release };
