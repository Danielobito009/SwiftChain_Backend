import { Request, Response } from 'express';
import { deliveryService } from '../services/deliveryService';

class DeliveryController {
  async getDeliveryETA(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Delivery ID is required',
        });
        return;
      }

      const result = await deliveryService.calculateDeliveryETA({ deliveryId: id });

      res.status(200).json({
        success: true,
        data: result,
        message: 'ETA calculated successfully',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = errorMessage.includes('not found') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: errorMessage || 'Failed to calculate ETA',
      });
    }
  }
}

export const deliveryController = new DeliveryController();
