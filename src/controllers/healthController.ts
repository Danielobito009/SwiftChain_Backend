/**
 * HealthController
 *
 * HTTP glue layer for GET /api/v1/health.
 *
 * Responsibilities (Controller layer only — no business logic here):
 *   - Call healthService.checkHealth().
 *   - Map the service result to the correct HTTP status code:
 *       200 OK                — overall status is "healthy"
 *       503 Service Unavailable — overall status is "degraded"
 *   - Wrap the result in the project's standard response envelope.
 *   - Forward unexpected errors to the global error-handling middleware
 *     via next().
 *
 * Architecture: Route → Controller (this file) → Service → Infrastructure.
 */

import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { checkHealth } from '../services/healthService';
import logger from '../config/logger';

/**
 * GET /api/v1/health
 *
 * Performs a live health check of MongoDB and the Stellar Soroban RPC node.
 *
 * Response 200 — all services healthy:
 * ```json
 * {
 *   "status": "success",
 *   "data": {
 *     "status": "healthy",
 *     "services": {
 *       "mongodb":    { "status": "healthy", "readyState": 1, "readyStateLabel": "connected" },
 *       "stellarRpc": { "status": "healthy", "network": "testnet", "latestLedger": 12345678,
 *                       "latencyMs": 142, "checkedAt": "2026-01-01T00:00:00.000Z" }
 *     },
 *     "timestamp": "2026-01-01T00:00:00.000Z",
 *     "uptime": 3600.123
 *   }
 * }
 * ```
 *
 * Response 503 — one or more services unhealthy:
 * ```json
 * {
 *   "status": "error",
 *   "data": {
 *     "status": "degraded",
 *     "services": {
 *       "mongodb":    { "status": "unhealthy", "readyState": 0, "readyStateLabel": "disconnected",
 *                       "error": "MongoDB is not connected (readyState=0 \"disconnected\")" },
 *       "stellarRpc": { "status": "healthy", ... }
 *     },
 *     "timestamp": "...",
 *     "uptime": ...
 *   }
 * }
 * ```
 */
export async function getHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await checkHealth();

    if (result.status === 'healthy') {
      res.status(StatusCodes.OK).json({
        status: 'success',
        data: result,
      });
    } else {
      res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
        status: 'error',
        data: result,
      });
    }
  } catch (err) {
    // checkHealth() is designed never to throw, but guard against truly
    // unexpected failures so the endpoint never brings down the process.
    logger.error('[HealthController] Unexpected error during health check:', err);
    next(err);
  }
}
