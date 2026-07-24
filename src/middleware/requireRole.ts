import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserRole } from '../interfaces/IUser';
import type { IUser } from '../interfaces/IUser';
import AppError from '../utils/AppError';

/**
 * Role-based access control middleware factory.
 *
 * Returns a middleware that allows the request to proceed only when
 * `req.user.role` is included in the provided `allowedRoles` list.
 *
 * Must be used **after** the `authenticate` middleware so `req.user` is set.
 *
 * @example
 *   router.put('/users/:id/suspend', authenticate, requireRole(UserRole.ADMIN), suspendUser);
 */
const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: IUser }).user;

    if (!user) {
      // Defensive: authenticate should always run first
      return next(
        new AppError(
          'Authentication required. Please provide a valid Bearer token.',
          StatusCodes.UNAUTHORIZED,
        ),
      );
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      return next(
        new AppError(
          'Access denied. You do not have permission to perform this action.',
          StatusCodes.FORBIDDEN,
        ),
      );
    }

    next();
  };
};

export default requireRole;
