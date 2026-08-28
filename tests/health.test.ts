import request from 'supertest';
import app from '../src/app';

// Mock the database connection to prevent open handles during tests
jest.mock('../src/config/database', () => ({
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
  waitForActiveTransactions: jest.fn(),
  startTrackedSession: jest.fn(),
  getActiveTransactionCount: jest.fn().mockReturnValue(0),
}));

// Mock the logger to keep test output clean
jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Health Check API', () => {
  it('should return 200 OK and status success', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body).toHaveProperty('message', 'SwiftChain-Backend is running');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
  });
});
