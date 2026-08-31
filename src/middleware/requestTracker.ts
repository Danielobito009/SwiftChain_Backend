import { Request, Response, NextFunction } from 'express';

/**
 * Tracks in-flight HTTP requests so graceful shutdown can drain them
 * before closing the process. Once shutdown begins, new requests receive
 * 503 Service Unavailable and a Connection: close header.
 */

let inFlightRequests = 0;
let isShuttingDown = false;

export const getInFlightRequestCount = (): number => inFlightRequests;

export const isServerShuttingDown = (): boolean => isShuttingDown;

/**
 * Mark the process as shutting down so the middleware rejects new work.
 * Idempotent.
 */
export const beginRequestDrain = (): void => {
  isShuttingDown = true;
};

/**
 * Reset drain state — intended for tests only.
 */
export const resetRequestTracker = (): void => {
  inFlightRequests = 0;
  isShuttingDown = false;
};

/**
 * Express middleware that:
 *   1. Rejects new requests with 503 once shutdown has started.
 *   2. Increments/decrements an in-flight counter for active requests.
 */
export const requestTracker = (req: Request, res: Response, next: NextFunction): void => {
  if (isShuttingDown) {
    res.setHeader('Connection', 'close');
    res.status(503).json({
      success: false,
      error: 'Server is shutting down',
    });
    return;
  }

  inFlightRequests += 1;

  let settled = false;
  const onSettled = (): void => {
    if (settled) {
      return;
    }
    settled = true;
    inFlightRequests = Math.max(0, inFlightRequests - 1);
  };

  res.on('finish', onSettled);
  res.on('close', onSettled);

  next();
};
