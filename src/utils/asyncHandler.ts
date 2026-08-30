import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async Express route handler so that any rejected promise is
 * forwarded to the global error-handling middleware via `next()`.
 *
 * Without this, a rejected promise inside a handler would result in an
 * unhandled rejection instead of a proper HTTP error response.
 */
export const asyncHandler =
  (handler: AsyncRequestHandler): RequestHandler =>
  (req, res, next): void => {
    handler(req, res, next).catch(next);
  };

export default asyncHandler;
