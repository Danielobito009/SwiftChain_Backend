import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status-codes';
import { getAllCircuitBreakerStatuses } from '../utils/circuitBreaker';

/**
 * CircuitBreakerController exposes the runtime state of every registered
 * circuit breaker so operators can observe system health without connecting
 * to an external APM tool.
 *
 * Follows the project's Controller → Service → Model layered pattern:
 *   - Controller  : this file — HTTP glue only
 *   - "Service"   : getAllCircuitBreakerStatuses() in utils/circuitBreaker.ts
 *   - Data source : in-memory registry populated at service construction time
 */
export class CircuitBreakerController {
  /**
   * GET /api/v1/health/circuit-breakers
   *
   * Returns the state and rolling statistics for every circuit breaker that
   * has been initialised since the process started.
   *
   * Response shape:
   * ```json
   * {
   *   "status": "success",
   *   "data": {
   *     "breakers": [
   *       {
   *         "name": "google-maps",
   *         "state": "closed",
   *         "stats": {
   *           "failures": 0,
   *           "successes": 42,
   *           "rejects": 0,
   *           "timeouts": 0,
   *           "fallbacks": 0,
   *           "fires": 42,
   *           "percentError": 0
   *         }
   *       },
   *       {
   *         "name": "soroban-rpc",
   *         "state": "open",
   *         "stats": { ... }
   *       }
   *     ],
   *     "summary": {
   *       "total": 3,
   *       "closed": 2,
   *       "open": 1,
   *       "halfOpen": 0
   *     }
   *   }
   * }
   * ```
   *
   * HTTP status codes:
   *   200 — all breakers closed (healthy)
   *   206 — one or more breakers open or half-open (degraded)
   */
  getStatus(req: Request, res: Response, next: NextFunction): void {
    try {
      const breakers = getAllCircuitBreakerStatuses();

      const summary = {
        total: breakers.length,
        closed: breakers.filter((b) => b.state === 'closed').length,
        open: breakers.filter((b) => b.state === 'open').length,
        halfOpen: breakers.filter((b) => b.state === 'halfOpen').length,
      };

      // Use 206 Partial Content when the system is operating in a degraded
      // state so monitoring tools can distinguish healthy from degraded
      // without parsing the body.
      const httpStatusCode =
        summary.open > 0 || summary.halfOpen > 0
          ? httpStatus.PARTIAL_CONTENT
          : httpStatus.OK;

      res.status(httpStatusCode).json({
        status: 'success',
        data: {
          breakers,
          summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const circuitBreakerController = new CircuitBreakerController();
