import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import logger from '../config/logger';

const MINUTE = 60 * 1000;

/** Reads a positive integer from the environment, falling back to a default. */
const envInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`Invalid value for ${key} ("${raw}"); falling back to ${fallback}`);
    return fallback;
  }

  return Math.floor(parsed);
};

/**
 * Identifies the client behind a request.
 *
 * Authenticated callers are keyed by user id so that a shared NAT or corporate
 * proxy does not cause one user to exhaust everyone else's budget. Anonymous
 * callers fall back to the IP resolved by Express, which honours the
 * `trust proxy` setting configured on the app.
 */
const resolveClientKey = (req: Request): string => {
  const userId = req.user?.id;
  if (userId) {
    return `user:${userId}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
};

/**
 * Keys auth attempts by the targeted account as well as the source IP.
 *
 * Brute-forcing a single account from a rotating pool of IPs would otherwise
 * slip past a purely IP-based limit, so the credential being attacked is part
 * of the key.
 */
const resolveCredentialKey = (req: Request): string => {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;
  const ipKey = `ip:${req.ip ?? 'unknown'}`;
  return email ? `${ipKey}|account:${email}` : ipKey;
};

/** Builds the JSON body returned once a limit is exceeded. */
const buildHandler =
  (scope: string, message: string) =>
  (req: Request, res: Response, _next: unknown, options: Options): void => {
    logger.warn(
      `Rate limit exceeded [${scope}] key=${resolveClientKey(req)} ` +
        `${req.method} ${req.originalUrl}`,
    );

    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      status: 'error',
      statusCode: StatusCodes.TOO_MANY_REQUESTS,
      message,
      retryAfter: retryAfterSeconds,
    });
  };

interface LimiterDefinition {
  scope: string;
  windowMs: number;
  max: number;
  message: string;
  keyGenerator?: (req: Request) => string;
  /** When true, successful responses do not count toward the limit. */
  skipSuccessfulRequests?: boolean;
}

/**
 * Creates a limiter with the project-wide defaults applied.
 *
 * Whether limiting is active is decided once, when the limiter is built,
 * rather than per request: the deployment environment does not change while
 * the process is running, and re-reading it on every request would make the
 * behaviour of a live server depend on mutable global state.
 */
const createLimiter = (definition: LimiterDefinition): RateLimitRequestHandler => {
  // Integration suites drive many requests through the same routes, so limits
  // are disabled under test to keep earlier cases from throttling later ones.
  const disabled = process.env.NODE_ENV === 'test';

  return rateLimit({
    windowMs: definition.windowMs,
    max: definition.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: definition.skipSuccessfulRequests ?? false,
    keyGenerator: definition.keyGenerator ?? resolveClientKey,
    handler: buildHandler(definition.scope, definition.message),
    skip: () => disabled,
  });
};

/**
 * Baseline limit applied to the whole API surface.
 *
 * Acts as a safety net; route-specific limiters below are deliberately
 * stricter and are mounted ahead of this one.
 */
export const globalLimiter = createLimiter({
  scope: 'global',
  windowMs: envInt('RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
  max: envInt('RATE_LIMIT_MAX_REQUESTS', 100),
  message: 'Too many requests from this client. Please try again later.',
});

/**
 * Strict limit for credential-checking endpoints (login, token refresh).
 *
 * Successful requests are not counted, so a legitimate user who signs in
 * correctly is never penalised; only failed attempts consume the budget,
 * which is precisely the brute-force signal we want to throttle.
 */
export const authLimiter = createLimiter({
  scope: 'auth',
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
  max: envInt('AUTH_RATE_LIMIT_MAX_REQUESTS', 5),
  message:
    'Too many authentication attempts. This account has been temporarily ' +
    'locked out. Please try again later.',
  keyGenerator: resolveCredentialKey,
  skipSuccessfulRequests: true,
});

/**
 * Limit for account-creation endpoints.
 *
 * Registration is expensive (bcrypt hashing) and is a common target for
 * automated signup abuse, so it is capped per IP over a long window.
 */
export const registrationLimiter = createLimiter({
  scope: 'registration',
  windowMs: envInt('REGISTRATION_RATE_LIMIT_WINDOW_MS', 60 * MINUTE),
  max: envInt('REGISTRATION_RATE_LIMIT_MAX_REQUESTS', 10),
  message: 'Too many accounts created from this address. Please try again later.',
});

/**
 * Limit for escrow endpoints.
 *
 * Escrow operations settle on-chain and are irreversible, so the write path is
 * throttled more aggressively than ordinary reads.
 */
export const escrowLimiter = createLimiter({
  scope: 'escrow',
  windowMs: envInt('ESCROW_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
  max: envInt('ESCROW_RATE_LIMIT_MAX_REQUESTS', 30),
  message: 'Too many escrow requests. Please slow down and try again shortly.',
});

/** Tight limit for the irreversible escrow money-movement operations. */
export const escrowMutationLimiter = createLimiter({
  scope: 'escrow:mutation',
  windowMs: envInt('ESCROW_MUTATION_RATE_LIMIT_WINDOW_MS', 60 * MINUTE),
  max: envInt('ESCROW_MUTATION_RATE_LIMIT_MAX_REQUESTS', 10),
  message: 'Too many escrow settlement requests. Please try again later.',
});

export default {
  globalLimiter,
  authLimiter,
  registrationLimiter,
  escrowLimiter,
  escrowMutationLimiter,
};
