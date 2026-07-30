import { Request, Response } from 'express';
import { deliveryHandlers } from '../indexer/deliveryHandlers';
import { StatusCodes } from 'http-status-codes';
import logger from '../config/logger';

export class IndexerController {
  /**
   * Endpoint to process a delivery_created event
   * Expects JSON body with { payload: "base64-encoded-xdr" }
   */
  public async handleDeliveryCreated(req: Request, res: Response): Promise<void> {
    try {
      const { payload } = req.body;

      if (!payload) {
        res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Missing payload in request body',
        });
        return;
      }

      const updatedDelivery = await deliveryHandlers.processDeliveryCreatedEvent(payload);

      res.status(StatusCodes.OK).json({
        success: true,
        message: 'Delivery updated successfully',
        data: updatedDelivery,
      });
    } catch (error: any) {
      logger.error(`IndexerController - handleDeliveryCreated error: ${error.message}`);
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Internal Server Error',
      });
    }
  }
}

export const indexerController = new IndexerController();
