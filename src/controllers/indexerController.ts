import { Request, Response, NextFunction } from 'express';
import { indexerService } from '../services/indexerService';
import { AppError } from '../errors/AppError';
import logger from '../config/logger';

export class IndexerController {
  public async getStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const statusData = await indexerService.getIndexerStatus();
      res.status(200).json({
        success: true,
        data: statusData,
      });
    } catch (error) {
      logger.error(
        `[IndexerController] getStatus error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      next(
        new AppError('Failed to retrieve indexer status', 500),
      );
    }
  }
}

export const indexerController = new IndexerController();
