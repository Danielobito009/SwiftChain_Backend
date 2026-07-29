import { StatusCodes } from 'http-status-codes';
import mongoose from 'mongoose';
import Dispute, { DisputeReason, DisputeStatus, IDispute } from '../models/Dispute';
import Delivery, { DeliveryStatus } from '../models/Delivery';
import { sorobanService } from '../blockchain/soroban.service';
import AppError from '../utils/AppError';
import logger from '../config/logger';
import type {
  CreateDisputeInput,
  ResolveDisputeInput,
  AddEvidenceInput,
  UpdateDisputeInput,
  DisputeFilter,
} from '../validators/disputeValidator';

const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.IN_PROGRESS,
];

const populateOptions = [
  { path: 'raisedBy', select: 'firstName lastName email' },
  { path: 'deliveryId', select: 'deliveryId status userId driverId' },
];

export const createDispute = async (input: CreateDisputeInput): Promise<IDispute> => {
  const { deliveryId, raisedBy, reason, description, evidenceUrls } = input;

  if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
    throw new AppError('Invalid delivery ID format.', StatusCodes.BAD_REQUEST);
  }

  const delivery = await Delivery.findById(deliveryId);
  if (!delivery) {
    throw new AppError('Delivery not found.', StatusCodes.NOT_FOUND);
  }

  if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
    throw new AppError(
      `Disputes can only be opened for deliveries that are assigned or in progress. Current status: '${delivery.status}'.`,
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  const isParticipant = delivery.userId === raisedBy || delivery.driverId === raisedBy;
  if (!isParticipant) {
    throw new AppError(
      'Only the customer or driver associated with this delivery may open a dispute.',
      StatusCodes.FORBIDDEN,
    );
  }

  const existingOpenDispute = await Dispute.findOne({
    deliveryId,
    status: { $in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
  });
  if (existingOpenDispute) {
    throw new AppError(
      'An unresolved dispute already exists for this delivery.',
      StatusCodes.CONFLICT,
    );
  }

  let raisedAtLedger: number | undefined;
  try {
    raisedAtLedger = await sorobanService.getLatestLedger();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.warn(`[Dispute] Failed to fetch latest Soroban ledger for audit stamp: ${message}`);
  }

  const dispute = await Dispute.create({
    deliveryId,
    raisedBy,
    reason,
    description,
    evidenceUrls,
    status: DisputeStatus.OPEN,
    raisedAtLedger,
  });

  logger.info(
    `[Dispute] User ${raisedBy} opened dispute ${dispute._id} for delivery ${deliveryId}`,
  );

  return dispute;
};

export const getDisputeById = async (id: string): Promise<IDispute> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid dispute ID format.', StatusCodes.BAD_REQUEST);
  }

  const dispute = await Dispute.findById(id).populate(populateOptions);
  if (!dispute) {
    throw new AppError('Dispute not found.', StatusCodes.NOT_FOUND);
  }

  return dispute;
};

export const getDisputes = async (filters: DisputeFilter) => {
  const { status, raisedBy, deliveryId, reason, page = 1, limit = 10 } = filters;
  const query: Record<string, unknown> = {};

  if (status) {
    query.status = status;
  }

  if (raisedBy) {
    if (!mongoose.Types.ObjectId.isValid(raisedBy)) {
      throw new AppError('Invalid raisedBy format.', StatusCodes.BAD_REQUEST);
    }
    query.raisedBy = raisedBy;
  }

  if (deliveryId) {
    if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
      throw new AppError('Invalid deliveryId format.', StatusCodes.BAD_REQUEST);
    }
    query.deliveryId = deliveryId;
  }

  if (reason) {
    if (!Object.values(DisputeReason).includes(reason)) {
      throw new AppError('Invalid dispute reason.', StatusCodes.BAD_REQUEST);
    }
    query.reason = reason;
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Dispute.find(query)
      .populate(populateOptions)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Dispute.countDocuments(query).exec(),
  ]);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const resolveDispute = async (
  id: string,
  input: ResolveDisputeInput,
): Promise<IDispute> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid dispute ID format.', StatusCodes.BAD_REQUEST);
  }

  const dispute = await Dispute.findById(id);
  if (!dispute) {
    throw new AppError('Dispute not found.', StatusCodes.NOT_FOUND);
  }

  if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.REJECTED) {
    throw new AppError(
      `Dispute is already ${dispute.status} and cannot be resolved again.`,
      StatusCodes.CONFLICT,
    );
  }

  if (input.status === DisputeStatus.RESOLVED && !input.resolutionNotes) {
    throw new AppError(
      'resolutionNotes are required when resolving a dispute.',
      StatusCodes.UNPROCESSABLE_ENTITY,
    );
  }

  dispute.status = input.status;
  dispute.resolutionNotes = input.resolutionNotes;
  dispute.resolvedBy = input.resolvedBy;
  dispute.resolvedAt = new Date();

  await dispute.save();

  logger.info(
    `[Dispute] Dispute ${id} updated to status '${input.status}' by ${input.resolvedBy}`,
  );

  return dispute;
};

export const addEvidence = async (id: string, input: AddEvidenceInput): Promise<IDispute> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid dispute ID format.', StatusCodes.BAD_REQUEST);
  }

  const dispute = await Dispute.findById(id);
  if (!dispute) {
    throw new AppError('Dispute not found.', StatusCodes.NOT_FOUND);
  }

  if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.REJECTED) {
    throw new AppError('Evidence cannot be added to a resolved or rejected dispute.', StatusCodes.CONFLICT);
  }

  const existingUrls = dispute.evidenceUrls || [];
  const newUrls = input.evidenceUrls.filter((url) => !existingUrls.includes(url));
  dispute.evidenceUrls = [...existingUrls, ...newUrls];

  await dispute.save();

  logger.info(`[Dispute] ${newUrls.length} evidence URLs added to dispute ${id}`);

  return dispute;
};

export const updateDispute = async (id: string, input: UpdateDisputeInput): Promise<IDispute> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid dispute ID format.', StatusCodes.BAD_REQUEST);
  }

  const dispute = await Dispute.findById(id);
  if (!dispute) {
    throw new AppError('Dispute not found.', StatusCodes.NOT_FOUND);
  }

  if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.REJECTED) {
    throw new AppError('A resolved or rejected dispute cannot be modified.', StatusCodes.CONFLICT);
  }

  if (input.reason !== undefined) {
    dispute.reason = input.reason;
  }
  if (input.description !== undefined) {
    dispute.description = input.description;
  }
  if (input.evidenceUrls !== undefined) {
    dispute.evidenceUrls = input.evidenceUrls;
  }

  await dispute.save();

  logger.info(`[Dispute] Dispute ${id} updated`);

  return dispute;
};
