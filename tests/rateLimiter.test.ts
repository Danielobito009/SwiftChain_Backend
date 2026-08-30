import express, { Express } from 'express';
import request from 'supertest';

jest.mock('../src/config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

/**
 * The limiters read their configuration at import time and disable themselves
 * under `NODE_ENV=test`, so each case re-imports the module in an isolated
 * registry with the environment it needs.
 */
const loadLimiters = async (
  env: Record<string, string>,
): Promise<typeof import('../src/middlewares/rateLimiter')> => {
  let limiters!: typeof import('../src/middlewares/rateLimiter');

  await jest.isolateModulesAsync(async () => {
    const previous = { ...process.env };
    Object.assign(process.env, env);
    limiters = await import('../src/middlewares/rateLimiter');
    process.env = previous;
  });

  return limiters;
};

/** Builds a throwaway app exposing one route behind the supplied middleware. */
const appWith = (middleware: express.RequestHandler, method: 'get' | 'post' = 'post'): Express => {
  const app = express();
  app.use(express.json());
  app[method]('/probe', middleware, (_req, res) => {
    res.status(200).json({ status: 'success' });
  });
  return app;
};

describe('Rate limiting middleware', () => {
  describe('auth limiter', () => {
    it('blocks with 429 once the failed-attempt budget is exhausted', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '3',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      });

      // The route returns 401 so that `skipSuccessfulRequests` does not
      // refund the attempt, mirroring a failed login.
      const app = express();
      app.use(express.json());
      app.post('/login', authLimiter, (_req, res) => {
        res.status(401).json({ status: 'error' });
      });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const allowed = await request(app).post('/login').send({ email: 'victim@test.io' });
        expect(allowed.status).toBe(401);
      }

      const blocked = await request(app).post('/login').send({ email: 'victim@test.io' });

      expect(blocked.status).toBe(429);
      expect(blocked.body.status).toBe('error');
      expect(blocked.body.message).toMatch(/too many authentication attempts/i);
      expect(blocked.body.retryAfter).toBe(60);
      expect(blocked.headers['retry-after']).toBe('60');
    });

    it('does not count successful logins toward the limit', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '2',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const app = appWith(authLimiter);

      // Five successes exceed the budget of 2, yet none are throttled.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app).post('/probe').send({ email: 'ada@test.io' });
        expect(response.status).toBe(200);
      }
    });

    it('tracks each targeted account separately', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '2',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const app = express();
      app.use(express.json());
      app.post('/login', authLimiter, (_req, res) => {
        res.status(401).json({ status: 'error' });
      });

      await request(app).post('/login').send({ email: 'first@test.io' });
      await request(app).post('/login').send({ email: 'first@test.io' });

      const firstBlocked = await request(app).post('/login').send({ email: 'first@test.io' });
      expect(firstBlocked.status).toBe(429);

      // A different account from the same IP still has its own budget.
      const secondAllowed = await request(app).post('/login').send({ email: 'second@test.io' });
      expect(secondAllowed.status).toBe(401);
    });

    it('exposes the standard RateLimit headers', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '5',
        AUTH_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const response = await request(appWith(authLimiter))
        .post('/probe')
        .send({ email: 'ada@test.io' });

      expect(response.headers).toHaveProperty('ratelimit-limit', '5');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      // The legacy header set is disabled in favour of the standard one.
      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
    });
  });

  describe('escrow limiter', () => {
    it('throttles escrow requests beyond the configured budget', async () => {
      const { escrowLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        ESCROW_RATE_LIMIT_MAX_REQUESTS: '2',
        ESCROW_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const app = appWith(escrowLimiter, 'get');

      expect((await request(app).get('/probe')).status).toBe(200);
      expect((await request(app).get('/probe')).status).toBe(200);

      const blocked = await request(app).get('/probe');
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/too many escrow requests/i);
    });

    it('applies a tighter budget to irreversible settlement operations', async () => {
      const { escrowMutationLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        ESCROW_MUTATION_RATE_LIMIT_MAX_REQUESTS: '1',
        ESCROW_MUTATION_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const app = appWith(escrowMutationLimiter);

      expect((await request(app).post('/probe').send({})).status).toBe(200);

      const blocked = await request(app).post('/probe').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/escrow settlement/i);
    });
  });

  describe('registration limiter', () => {
    it('caps account creation per address', async () => {
      const { registrationLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        REGISTRATION_RATE_LIMIT_MAX_REQUESTS: '2',
        REGISTRATION_RATE_LIMIT_WINDOW_MS: '60000',
      });

      const app = appWith(registrationLimiter);

      await request(app).post('/probe').send({});
      await request(app).post('/probe').send({});

      const blocked = await request(app).post('/probe').send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/too many accounts/i);
    });
  });

  describe('configuration', () => {
    it('falls back to the documented default when a value is invalid', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'development',
        AUTH_RATE_LIMIT_MAX_REQUESTS: 'not-a-number',
      });

      const response = await request(appWith(authLimiter))
        .post('/probe')
        .send({ email: 'ada@test.io' });

      // Falls back to the documented default of 5 rather than throwing.
      expect(response.headers['ratelimit-limit']).toBe('5');
    });

    it('is disabled under NODE_ENV=test so suites are not throttled', async () => {
      const { authLimiter } = await loadLimiters({
        NODE_ENV: 'test',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '1',
      });

      const app = appWith(authLimiter);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await request(app).post('/probe').send({ email: 'ada@test.io' });
        expect(response.status).toBe(200);
      }
    });
  });
});
