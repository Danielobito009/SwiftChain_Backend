import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import eventLogService from '../services/eventLogService';
import logger from '../config/logger';

export class EventLogController {
  /**
   * Get the last processed ledger sequence
   * GET /api/v1/eventlog/last-processed
   */
  async getLastProcessedLedger(req: Request, res: Response): Promise<Response> {
    try {
      const { eventType } = req.query;
      const lastLedger = await eventLogService.getLastProcessedLedger(
        eventType as string | undefined
      );
      return res.status(StatusCodes.OK).json({
        success: true,
        data: { lastProcessedLedger: lastLedger },
        message: 'Last processed ledger sequence retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in getLastProcessedLedger:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to retrieve last processed ledger',
      });
    }
  }

  /**
   * Get unprocessed events
   * GET /api/v1/eventlog/unprocessed
   */
  async getUnprocessedEvents(req: Request, res: Response): Promise<Response> {
    try {
      const events = await eventLogService.getUnprocessedEvents();
      return res.status(StatusCodes.OK).json({
        success: true,
        data: events,
        message: 'Unprocessed events retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in getUnprocessedEvents:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to retrieve unprocessed events',
      });
    }
  }

  /**
   * Get events by ledger sequence range
   * GET /api/v1/eventlog/range
   */
  async getEventsByLedgerRange(req: Request, res: Response): Promise<Response> {
    try {
      const { startLedger, endLedger, eventType } = req.query;
      
      if (!startLedger || !endLedger) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'startLedger and endLedger are required',
        });
      }

      const events = await eventLogService.getEventsByLedgerRange(
        parseInt(startLedger as string),
        parseInt(endLedger as string),
        eventType as string | undefined
      );
      
      return res.status(StatusCodes.OK).json({
        success: true,
        data: events,
        message: 'Events retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in getEventsByLedgerRange:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to retrieve events',
      });
    }
  }

  /**
   * Get event by transaction hash
   * GET /api/v1/eventlog/transaction/:hash
   */
  async getEventByTransactionHash(req: Request, res: Response): Promise<Response> {
    try {
      const { hash } = req.params;
      const event = await eventLogService.getEventByTransactionHash(hash);
      
      if (!event) {
        return res.status(StatusCodes.NOT_FOUND).json({
          success: false,
          message: 'Event not found',
        });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        data: event,
        message: 'Event retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in getEventByTransactionHash:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to retrieve event',
      });
    }
  }
}

export default new EventLogController();
