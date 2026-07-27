import { Request, Response, NextFunction } from 'express';
import { driverService } from '../services/driverService';

class DriverController {
  /**
   * GET /api/v1/drivers/leaderboard
   *
   * Returns drivers ranked by reputation points, highest first.
   * Supports ?page and ?limit query params.
   */
  async getLeaderboard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await driverService.getLeaderboard(page, limit);

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const driverController = new DriverController();
