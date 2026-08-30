import { Types } from 'mongoose';
import Escrow, { IEscrowDocument } from '../models/Escrow';
import ApiError from '../utils/ApiError';
import { PaginatedResult, QueryOptions } from '../types/query';
import { buildPaginationMeta } from '../middlewares/queryMiddleware';
import { recordAction } from './auditLogService';
import { AdminActionContext } from './userService';

/** Loads an escrow by id, rejecting malformed ids before querying. */
const findEscrowOrFail = async (escrowId: string): Promise<IEscrowDocument> => {
  if (!Types.ObjectId.isValid(escrowId)) {
    throw ApiError.badRequest('The supplied escrow id is not a valid identifier');
  }

  const escrow = await Escrow.findById(escrowId).exec();
  if (!escrow) {
    throw ApiError.notFound('Escrow not found');
  }

  return escrow;
};

/** Returns a page of escrow records for the supplied query options. */
export const listEscrows = async (
  options: QueryOptions,
): Promise<PaginatedResult<Record<string, unknown>>> => {
  const [items, totalItems] = await Promise.all([
    Escrow.find(options.filter)
      .populate('payer', 'name email')
      .populate('payee', 'name email')
      .sort(options.sort)
      .skip(options.skip)
      .limit(options.limit)
      .lean({ virtuals: true })
      .exec(),
    Escrow.countDocuments(options.filter).exec(),
  ]);

  return {
    items: items as unknown as Record<string, unknown>[],
    meta: buildPaginationMeta(totalItems, options.page, options.limit),
  };
};

/** Returns a single escrow record by id. */
export const getEscrowById = async (escrowId: string): Promise<Record<string, unknown>> => {
  const escrow = await findEscrowOrFail(escrowId);
  return escrow.toJSON();
};

/**
 * Moves an escrow to a terminal settlement state and audits the action.
 *
 * The audit entry is written first: an unauditable settlement must not
 * proceed, since these transitions move funds and cannot be undone.
 */
const settleEscrow = async (
  escrowId: string,
  nextStatus: 'released' | 'refunded',
  context: AdminActionContext,
): Promise<Record<string, unknown>> => {
  const escrow = await findEscrowOrFail(escrowId);

  if (escrow.status === nextStatus) {
    throw ApiError.conflict(`This escrow has already been ${nextStatus}`);
  }

  if (escrow.status === 'released' || escrow.status === 'refunded') {
    throw ApiError.conflict(
      `This escrow is already settled (${escrow.status}) and cannot be modified`,
    );
  }

  await recordAction({
    adminId: context.adminId,
    action: nextStatus === 'released' ? 'escrow.released' : 'escrow.refunded',
    targetType: 'Escrow',
    targetId: escrow.id as string,
    reason: context.reason,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    changes: { status: { from: escrow.status, to: nextStatus } },
  });

  escrow.status = nextStatus;
  await escrow.save();

  return escrow.toJSON();
};

/** Refunds a held escrow back to the payer. */
export const refundEscrow = (
  escrowId: string,
  context: AdminActionContext,
): Promise<Record<string, unknown>> => settleEscrow(escrowId, 'refunded', context);

/** Releases a held escrow to the payee. */
export const releaseEscrow = (
  escrowId: string,
  context: AdminActionContext,
): Promise<Record<string, unknown>> => settleEscrow(escrowId, 'released', context);

export default { listEscrows, getEscrowById, refundEscrow, releaseEscrow };
