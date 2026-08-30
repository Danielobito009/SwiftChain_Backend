import { UserRole } from '../models/User';

/** The authenticated principal attached to a request by `authenticate`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

/** JWT payload issued by the auth service. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by the `authenticate` middleware for protected routes. */
      user?: AuthenticatedUser;
    }
  }
}
