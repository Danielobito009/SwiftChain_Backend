/**
 * Unit tests for the withRetry exponential-backoff helper.
 */

import { withRetry, computeBackoffDelay } from '../src/utils/rpcRetry';

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('withRetry', () => {
  it('returns the result immediately when the operation succeeds on the first try', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 2 });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error once maxAttempts is exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 })).rejects.toThrow(
      'persistent failure',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('not retryable'));

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 1,
        maxDelayMs: 2,
        isRetryable: () => false,
      }),
    ).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('computeBackoffDelay', () => {
  const options = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1000, factor: 2, jitter: 0 };

  it('grows exponentially with the attempt number', () => {
    expect(computeBackoffDelay(0, options)).toBe(100);
    expect(computeBackoffDelay(1, options)).toBe(200);
    expect(computeBackoffDelay(2, options)).toBe(400);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeBackoffDelay(10, options)).toBe(1000);
  });
});
