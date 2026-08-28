import Redis from 'ioredis';
import env from './env';
import logger from './logger';

/**
 * Lazily-created Redis client singleton.
 *
 * The client is only instantiated when REDIS_URL is present in the
 * environment.  When absent, `redisClient` is `null` and the idempotency
 * service falls back to the MongoDB-backed store automatically.
 *
 * Connection errors are logged but never crash the process — the fallback
 * path ensures the API keeps running even if Redis is temporarily unavailable.
 */
let redisClient: Redis | null = null;

if (env.REDIS_URL) {
  redisClient = new Redis(env.REDIS_URL, {
    // Retry with exponential back-off, capped at 10 s, up to 10 attempts.
    retryStrategy: (times: number): number | null => {
      if (times > 10) {
        logger.error('[Redis] Max reconnection attempts reached — giving up');
        return null; // stop retrying
      }
      return Math.min(times * 200, 10_000);
    },
    // Surface connection errors rather than swallowing them silently.
    enableOfflineQueue: false,
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });

  redisClient.on('connect', () => logger.info('[Redis] Connected'));
  redisClient.on('ready', () => logger.info('[Redis] Ready'));
  redisClient.on('error', (err: Error) => logger.error('[Redis] Error:', err.message));
  redisClient.on('close', () => logger.warn('[Redis] Connection closed'));
  redisClient.on('reconnecting', () => logger.info('[Redis] Reconnecting…'));
} else {
  logger.info('[Redis] REDIS_URL not set — idempotency will use MongoDB fallback store');
}

export default redisClient;
