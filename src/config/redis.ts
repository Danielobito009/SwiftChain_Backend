import Redis from 'ioredis';
import logger from './logger';

let client: Redis | null = null;

/**
 * Return a shared Redis client when REDIS_URL is configured.
 * Returns null when caching is disabled (no URL), allowing callers to
 * fall back to live API calls without failing the request path.
 */
export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return null;
  }

  if (!client) {
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    client.on('error', (error) => {
      logger.error('[Redis] Connection error:', error);
    });
  }

  return client;
}

/** Establish the Redis connection at process startup. */
export async function connectRedis(): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    logger.info('[Redis] REDIS_URL not set — ETA caching disabled');
    return;
  }

  if (redis.status === 'ready') {
    return;
  }

  await redis.connect();
  logger.info('[Redis] Connected for ETA caching');
}

/** Close the Redis connection during graceful shutdown. */
export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info('[Redis] Connection closed');
  }
}

/** Test helper — reset the singleton between unit tests. */
export function resetRedisClientForTests(): void {
  client = null;
}
