import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import ApiError from '../utils/ApiError';
import { AuthenticatedUser, JwtPayload } from '../types/auth';
import { USER_ROLES, UserRole } from '../models/User';

const BEARER_PREFIX = 'Bearer ';

/** Reads the JWT secret, failing fast if the deployment is misconfigured. */
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, 'JWT_SECRET is not configured', false);
  }
  return secret;
};

/** Narrows an arbitrary decoded token to our expected payload shape. */
const isJwtPayload = (value: unknown): value is JwtPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sub === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    USER_ROLES.includes(candidate.role as UserRole)
  );
};

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * resulting principal to `req.user`.
 */
export const authenticate: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(ApiError.unauthorized('Authentication token is missing'));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (!isJwtPayload(decoded)) {
      next(ApiError.unauthorized('Authentication token payload is malformed'));
      return;
    }

    const user: AuthenticatedUser = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized('Authentication token has expired'));
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(ApiError.unauthorized('Authentication token is invalid'));
      return;
    }
    next(error);
  }
};

/**
 * Restricts a route to the given roles. Must be mounted after `authenticate`.
 */
export const authorize =
  (...roles: readonly UserRole[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication is required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have permission to perform this action'));
      return;
    }

    next();
  };

export default { authenticate, authorize };
