import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status-codes';
import { DeliveryStatus } from '../models/Delivery';
import {
  deliveryService,
  CreateDeliveryInput,
  UpdateDeliveryInput,
  DeliveryFilter,
  AssignDriverInput,
} from '../services/delivery.service';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

export class DeliveryController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: CreateDeliveryInput = {
        trackingNumber: req.body.trackingNumber,
        customer: req.body.customer,
        pickup: req.body.pickup,
        dropoff: req.body.dropoff,
        package: req.body.package,
        deliveryFee: req.body.deliveryFee,
        escrowAmount: req.body.escrowAmount,
        notes: req.body.notes,
      };

      const delivery = await deliveryService.create(input);
      res.status(httpStatus.CREATED).json({
        status: 'success',
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const delivery = await deliveryService.getById(req.params.id);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const statusParam = req.query.status as string | undefined;
      const statusNormalized = statusParam ? statusParam.toLowerCase() : undefined;
      const validatedStatus = Object.values(DeliveryStatus).includes(
        statusNormalized as DeliveryStatus,
      )
        ? (statusNormalized as DeliveryStatus)
        : undefined;

      const filters: DeliveryFilter = {
        status: validatedStatus,
        driver: req.query.driver as string | undefined,
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
      };

      const result = await deliveryService.list(filters);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: result.data,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: UpdateDeliveryInput = {
        status: req.body.status,
        driver: req.body.driver,
        estimatedDistance: req.body.estimatedDistance,
        estimatedDuration: req.body.estimatedDuration,
        stellarTransactionId: req.body.stellarTransactionId,
        notes: req.body.notes,
      };

      const delivery = await deliveryService.update(req.params.id, input);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }

  async archive(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthenticatedRequest).user?.id;
      const delivery = await deliveryService.archive(req.params.id, userId);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: delivery,
        message: 'Delivery archived successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async restore(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const delivery = await deliveryService.restore(req.params.id);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: delivery,
        message: 'Delivery restored successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async listArchived(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

      const result = await deliveryService.listArchived(page, limit);
      res.status(httpStatus.OK).json({
        status: 'success',
        data: result.data,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/deliveries/:id/assign-driver
   *
   * Assigns a driver to a delivery.  The request is rejected with a clear
   * error if the delivery's Soroban escrow contract has not been successfully
   * initialised (i.e. the escrow record is absent or its `lockStatus` is not
   * `LOCKED`).
   *
   * Body: { driverId: string }
   *
   * Responses:
   *   200 — driver assigned, returns updated delivery document.
   *   400 — invalid delivery id or missing driverId.
   *   404 — delivery not found.
   *   409 — delivery already assigned / completed / cancelled, or escrow not LOCKED.
   *   422 — escrow record does not exist (contract never initialised).
   */
  async assignDriver(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input: AssignDriverInput = {
        deliveryId: req.params.id,
        driverId: req.body.driverId,
      };

      const delivery = await deliveryService.assignDriver(input);

      res.status(httpStatus.OK).json({
        status: 'success',
        message: 'Driver assigned successfully.',
        data: delivery,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const deliveryController = new DeliveryController();
