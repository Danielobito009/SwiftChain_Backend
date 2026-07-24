import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Delivery } from '../models/deliveryModel';
import type { DeliveryStatus } from '../models/deliveryModel';
import { HttpError } from '../utils/httpError';

const allowedStatuses: readonly DeliveryStatus[] = [
  'pending',
  'assigned',
  'picked_up',
  'in_transit',
  'delivered',
] as const;

const allowedTransitions: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  pending: ['assigned'],
  assigned: ['picked_up'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: [],
};

export const updateDeliveryStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const nextStatus = req.body?.status as unknown;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new HttpError(400, 'Invalid delivery ID'));
    }

    if (typeof nextStatus !== 'string' || !allowedStatuses.includes(nextStatus as DeliveryStatus)) {
      return next(new HttpError(400, 'Invalid status value'));
    }

    const delivery = await Delivery.findById(id);
    if (!delivery) {
      return next(new HttpError(404, 'Delivery not found'));
    }

    const currentStatus = delivery.status as DeliveryStatus;
    const isAllowed = allowedTransitions[currentStatus].includes(nextStatus as DeliveryStatus);

    if (!isAllowed) {
      return next(new HttpError(400, 'Invalid status transition'));
    }

    delivery.status = nextStatus as DeliveryStatus;
    await delivery.save();

    res.status(200).json({
      status: 'success',
      data: delivery,
    });
  } catch (error) {
    next(error as Error);
  }
};

