import logger from '../config/logger';

/**
 * Options controlling retry/backoff behaviour for `withRetry`.
 */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 5. */
  maxAttempts?: number;
  /** Base delay in milliseconds used for exponential backoff. Default: 250. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff delay. Default: 8000. */
  maxDelayMs?: number;
  /** Multiplier applied to the delay on each retry. Default: 2. */
  factor?: number;
  /** Fraction of jitter (0-1) applied to each computed delay. Default: 0.2. */
  jitter?: number;
  /** Label used in log messages to identify the operation being retried. */
  operationName?: string;
  /** Predicate deciding whether a given error should trigger a retry. Defaults to retrying everything. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'operationName' | 'isRetryable'>> = {
  maxAttempts: 5,
  baseDelayMs: 250,
  maxDelayMs: 8000,
  factor: 2,
  jitter: 0.2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute the delay for a given retry attempt using exponential backoff with
 * full jitter, capped at `maxDelayMs`.
 *
 * @param attempt Zero-based retry attempt number (0 = first retry).
 */
export function computeBackoffDelay(
  attempt: number,
  options: Required<Omit<RetryOptions, 'operationName' | 'isRetryable'>>,
): number {
  const exponential = options.baseDelayMs * Math.pow(options.factor, attempt);
  const capped = Math.min(exponential, options.maxDelayMs);
  const jitterRange = capped * options.jitter;
  const jitterOffset = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, Math.round(capped + jitterOffset));
}

/**
 * Execute `fn`, retrying with exponential backoff on failure.
 *
 * Intended for wrapping Soroban RPC calls that may fail transiently due to
 * rate limiting (HTTP 429) or temporary node outages. Every failed attempt
 * is logged; once all attempts are exhausted the last error is rethrown so
 * callers can handle it as they would an unwrapped RPC failure.
 *
 * @param fn      The async operation to execute.
 * @param options Retry/backoff configuration.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  const operationName = options.operationName ?? 'rpc-call';
  const isRetryable = options.isRetryable ?? ((): boolean => true);

  let lastError: unknown;

  for (let attempt = 0; attempt < resolved.maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const attemptNumber = attempt + 1;
      const isLastAttempt = attemptNumber >= resolved.maxAttempts;
      const message = err instanceof Error ? err.message : String(err);

      if (!isRetryable(err) || isLastAttempt) {
        logger.error(
          `[RPC Retry] ${operationName} failed permanently after ${attemptNumber} attempt(s) — error="${message}"`,
        );
        throw err;
      }

      const delayMs = computeBackoffDelay(attempt, resolved);

      logger.warn(
        `[RPC Retry] ${operationName} attempt ${attemptNumber}/${resolved.maxAttempts} failed ` +
          `— error="${message}" — retrying in ${delayMs}ms`,
      );

      await sleep(delayMs);
    }
  }

  // Unreachable in practice (loop always returns or throws), kept for type safety.
  throw lastError;
}
