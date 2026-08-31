import request from 'supertest';
import type { Express } from 'express';

// Mock the database connection to prevent open handles during tests
jest.mock('../src/config/database', () => ({
  connectDatabase: jest.fn(),
}));

// Mock the logger to keep test output clean
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

const ALLOWED_ORIGIN = 'http://localhost:3000';
const DISALLOWED_ORIGIN = 'http://evil.example.com';

const loadApp = async (): Promise<Express> => {
  process.env.CORS_ORIGIN = ALLOWED_ORIGIN;
  jest.resetModules();
  const { default: app } = await import('../src/app');
  return app;
};

describe('Security headers (Helmet)', () => {
  it('sets hardened HTTP security headers on responses', async () => {
    const app = await loadApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
    expect(res.headers).toHaveProperty('content-security-policy');
    expect(res.headers).toHaveProperty('strict-transport-security');
    // Helmet removes the framework fingerprint header
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });
});

describe('CORS policy', () => {
  it('reflects the origin for allowed frontend origins', async () => {
    const app = await loadApp();
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects requests from disallowed origins', async () => {
    const app = await loadApp();
    const res = await request(app).get('/health').set('Origin', DISALLOWED_ORIGIN);

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight (OPTIONS) requests for allowed origins', async () => {
    const app = await loadApp();
    const res = await request(app)
      .options('/api/v1')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('allows non-browser requests without an Origin header', async () => {
    const app = await loadApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});
