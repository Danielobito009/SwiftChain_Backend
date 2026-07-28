import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { checkIndexerLag, getRecentAlerts } from '../services/monitorService';

// ─── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/monitor/indexer-lag
 *
 * Runs an on-demand indexer-lag check (processed ledger vs. live network
 * ledger) and returns the result. Also persists an alert record and fires
 * the configured webhook if the threshold is breached.
 *
 * Access: Admin only.
 */
export const getIndexerLagStatus = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await checkIndexerLag();

    res.status(StatusCodes.OK).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/monitor/indexer-lag/alerts
 *
 * Returns the most recent persisted indexer-lag alerts.
 *
 * Query:
 *   - limit {number} Optional — max records to return (1-100, default 20).
 *
 * Access: Admin only.
 */
export const listIndexerLagAlerts = async (
  req: Request<unknown, unknown, unknown, { limit?: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsedLimit = req.query.limit ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(parsedLimit) ? (parsedLimit as number) : undefined;

    const alerts = await getRecentAlerts(limit);

    res.status(StatusCodes.OK).json({
      status: 'success',
      data: { alerts, count: alerts.length },
    });
  } catch (error) {
    next(error);
  }
};
