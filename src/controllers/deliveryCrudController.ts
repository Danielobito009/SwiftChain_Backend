import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Delivery, { DeliveryStatus } from '../models/Delivery';

// POST /api/v1/deliveries
export const createDelivery = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { sender, recipient, packageDescription, weight, estimatedValue, notes } = req.body;

    if (!sender?.name || !sender?.contact || !sender?.address) {
      res.status(400).json({
        status: 'error',
        message: 'sender.name, sender.contact, and sender.address are required',
      });
      return;
    }
    if (!recipient?.name || !recipient?.contact || !recipient?.address) {
      res.status(400).json({
        status: 'error',
        message: 'recipient.name, recipient.contact, and recipient.address are required',
      });
      return;
    }
    if (!packageDescription) {
      res.status(400).json({ status: 'error', message: 'packageDescription is required' });
      return;
    }

    const trackingId = `SWIFT-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

    const delivery = await Delivery.create({
      trackingId,
      sender,
      recipient,
      packageDescription,
      weight,
      estimatedValue,
      notes,
    });

    res.status(201).json({ status: 'success', data: delivery });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/deliveries
export const getDeliveries = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;

    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    const [deliveries, total] = await Promise.all([
      Delivery.find(filter).sort({ createdAt: sortOrder }).skip(skip).limit(limit).lean(),
      Delivery.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      data: deliveries,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/deliveries/:id
export const getDeliveryById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid delivery ID' });
      return;
    }

    const delivery = await Delivery.findById(id).lean();

    if (!delivery) {
      res.status(404).json({ status: 'error', message: 'Delivery not found' });
      return;
    }

    res.status(200).json({ status: 'success', data: delivery });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/deliveries/:id/assign
export const assignDriver = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { driverId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ status: 'error', message: 'Invalid delivery ID' });
      return;
    }

    if (!driverId || typeof driverId !== 'string' || !driverId.trim()) {
      res.status(400).json({ status: 'error', message: 'driverId is required' });
      return;
    }

    const delivery = await Delivery.findById(id);

    if (!delivery) {
      res.status(404).json({ status: 'error', message: 'Delivery not found' });
      return;
    }

    if (delivery.status !== DeliveryStatus.PENDING) {
      res.status(409).json({
        status: 'error',
        message: `Cannot assign driver to a delivery with status '${delivery.status}'`,
      });
      return;
    }

    delivery.driverId = driverId.trim();
    delivery.status = DeliveryStatus.ASSIGNED;
    await delivery.save();

    res.status(200).json({ status: 'success', data: delivery });
  } catch (err) {
    next(err);
  }
};
