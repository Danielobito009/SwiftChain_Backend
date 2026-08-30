import { Types } from 'mongoose';
import httpStatus from 'http-status-codes';
import Delivery, { IDelivery, DeliveryStatus, ILocation, IPackage } from '../models/Delivery';
import Escrow, { EscrowLockStatus } from '../models/Escrow';
import { AppError } from '../utils/AppError';
import logger from '../config/logger';

export interface CreateDeliveryInput {
  trackingNumber: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
  };
  pickup: ILocation;
  dropoff: ILocation;
  package: IPackage;
  deliveryFee: number;
  escrowAmount: number;
  notes?: string;
}

export interface UpdateDeliveryInput {
  status?: DeliveryStatus;
  driver?: string;
  estimatedDistance?: number;
  estimatedDuration?: number;
  stellarTransactionId?: string;
  notes?: string;
}

export interface AssignDriverInput {
  /** MongoDB `_id` of the delivery to assign a driver to. */
  deliveryId: string;
  /** The driver identifier to assign. */
  driverId: string;
}

export interface DeliveryFilter {
  status?: DeliveryStatus;
  driver?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class DeliveryService {
  async create(input: CreateDeliveryInput): Promise<IDelivery> {
    const existing = await Delivery.findOne({
      trackingNumber: input.trackingNumber,
    }).setOptions({ includeDeleted: true });

    if (existing) {
      throw new AppError('Delivery with this tracking number already exists', httpStatus.CONFLICT);
    }

    const delivery = await Delivery.create(input);
    logger.info(`Delivery created: ${delivery.trackingNumber}`);
    return delivery;
  }

  async getById(id: string): Promise<IDelivery> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid delivery ID', httpStatus.BAD_REQUEST);
    }

    const delivery = await Delivery.findById(id);
    if (!delivery) {
      throw new AppError('Delivery not found', httpStatus.NOT_FOUND);
    }
    return delivery;
  }

  async list(filters: DeliveryFilter): Promise<PaginatedResult<IDelivery>> {
    const { status, driver, search, page = 1, limit = 10 } = filters;

    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }

    if (driver) {
      query.driver = new Types.ObjectId(driver);
    }

    if (search) {
      query.$or = [
        { trackingNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Delivery.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Delivery.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, input: UpdateDeliveryInput): Promise<IDelivery> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid delivery ID', httpStatus.BAD_REQUEST);
    }

    const delivery = await Delivery.findByIdAndUpdate(
      id,
      { $set: input },
      { new: true, runValidators: true },
    );

    if (!delivery) {
      throw new AppError('Delivery not found', httpStatus.NOT_FOUND);
    }

    logger.info(`Delivery updated: ${delivery.trackingNumber}`);
    return delivery;
  }

  async archive(id: string, userId?: string): Promise<IDelivery> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid delivery ID', httpStatus.BAD_REQUEST);
    }

    const delivery = await Delivery.findById(id).setOptions({ includeDeleted: true });
    if (!delivery) {
      throw new AppError('Delivery not found', httpStatus.NOT_FOUND);
    }

    if (delivery.isDeleted) {
      throw new AppError('Delivery is already archived', httpStatus.CONFLICT);
    }

    return delivery.softDelete(userId);
  }

  async restore(id: string): Promise<IDelivery> {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError('Invalid delivery ID', httpStatus.BAD_REQUEST);
    }

    const delivery = await Delivery.findById(id).setOptions({ includeDeleted: true });
    if (!delivery) {
      throw new AppError('Delivery not found', httpStatus.NOT_FOUND);
    }

    if (!delivery.isDeleted) {
      throw new AppError('Delivery is not archived', httpStatus.CONFLICT);
    }

    return delivery.restore();
  }

  async listArchived(page = 1, limit = 10): Promise<PaginatedResult<IDelivery>> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      Delivery.find({ isDeleted: true })
        .setOptions({ includeDeleted: true })
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      Delivery.countDocuments({ isDeleted: true }).setOptions({ includeDeleted: true }).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Assign a driver to a delivery, **only if the Soroban escrow contract for
   * that delivery is fully initialised (locked)**.
   *
   * Guard rules (checked in order):
   *   1. Delivery must exist and not be soft-deleted.
   *   2. Delivery must not already be in a terminal state (completed/cancelled).
   *   3. Delivery must not already have a driver assigned.
   *   4. An Escrow record must exist for the delivery.
   *   5. The escrow `lockStatus` must be `LOCKED`.
   *      - `PENDING`  → contract initialisation has not completed yet (409).
   *      - `RELEASED` / `REFUNDED` / `DISPUTED` → funds are no longer held (409).
   *      - Missing escrow record → contract was never initialised (422).
   *
   * On success the delivery `status` is advanced to `ASSIGNED` and the
   * `driverId` field is set.  Both writes happen in the same document save so
   * there is no partial-update window.
   *
   * @throws {AppError} 400 — invalid delivery id format.
   * @throws {AppError} 404 — delivery not found.
   * @throws {AppError} 409 — delivery already assigned, completed, or cancelled.
   * @throws {AppError} 422 — escrow record absent (contract never initialised).
   * @throws {AppError} 409 — escrow exists but is not in LOCKED state.
   */
  async assignDriver(input: AssignDriverInput): Promise<IDelivery> {
    const { deliveryId, driverId } = input;

    if (!Types.ObjectId.isValid(deliveryId)) {
      throw new AppError('Invalid delivery ID', httpStatus.BAD_REQUEST);
    }

    // ── 1. Load delivery ────────────────────────────────────────────────────
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) {
      throw new AppError('Delivery not found', httpStatus.NOT_FOUND);
    }

    // ── 2. Guard: terminal statuses ─────────────────────────────────────────
    if (
      delivery.status === DeliveryStatus.COMPLETED ||
      delivery.status === DeliveryStatus.CANCELLED
    ) {
      throw new AppError(
        `Cannot assign a driver to a delivery with status '${delivery.status}'.`,
        httpStatus.CONFLICT,
      );
    }

    // ── 3. Guard: already assigned ──────────────────────────────────────────
    if (delivery.status === DeliveryStatus.ASSIGNED) {
      throw new AppError(
        'A driver has already been assigned to this delivery.',
        httpStatus.CONFLICT,
      );
    }

    // ── 4. Load escrow record ───────────────────────────────────────────────
    const escrow = await Escrow.findOne({ delivery: delivery._id });

    if (!escrow) {
      logger.warn(
        `[DeliveryService] assignDriver blocked — no escrow record for delivery=${deliveryId}`,
      );
      throw new AppError(
        'Driver assignment is not allowed: the Soroban escrow contract for this delivery ' +
          'has not been initialised. Ensure the escrow is funded on-chain before assigning a driver.',
        httpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // ── 5. Guard: escrow must be LOCKED ─────────────────────────────────────
    if (escrow.lockStatus !== EscrowLockStatus.LOCKED) {
      const statusDescriptions: Record<EscrowLockStatus, string> = {
        [EscrowLockStatus.PENDING]:
          'the escrow contract initialisation is still pending — funds have not been locked yet',
        [EscrowLockStatus.LOCKED]: '', // handled above (success path)
        [EscrowLockStatus.RELEASED]:
          'the escrowed funds have already been released',
        [EscrowLockStatus.REFUNDED]:
          'the escrowed funds have been refunded',
        [EscrowLockStatus.DISPUTED]:
          'the escrow is currently under dispute',
      };

      const reason =
        statusDescriptions[escrow.lockStatus] ??
        `the escrow is in an unexpected state '${escrow.lockStatus}'`;

      logger.warn(
        `[DeliveryService] assignDriver blocked — escrow lockStatus=${escrow.lockStatus} ` +
          `delivery=${deliveryId}`,
      );

      throw new AppError(
        `Driver assignment rejected: ${reason}. ` +
          'The escrow contract must be in the LOCKED state before a driver can be assigned.',
        httpStatus.CONFLICT,
      );
    }

    // ── All guards passed — perform the assignment ──────────────────────────
    delivery.driverId = driverId;
    delivery.status = DeliveryStatus.ASSIGNED;
    const updated = await delivery.save();

    logger.info(
      `[DeliveryService] Driver assigned — delivery=${deliveryId} ` +
        `driver=${driverId} escrow=${String(escrow._id)}`,
    );

    return updated;
  }
}

export const deliveryService = new DeliveryService();
