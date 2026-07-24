import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Delivery } from '../src/models/deliveryModel';

import { Express } from 'express';

jest.setTimeout(60000);

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('Delivery Status Update API', () => {
  let app: Express;
  let mongoServer: MongoMemoryServer;
  const jwtSecret = 'test-secret';

  const buildToken = (role = 'driver'): string => {
    return jwt.sign({ sub: 'test-user-id', role }, jwtSecret, { expiresIn: '1h' });
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    process.env.JWT_SECRET = jwtSecret;

    const imported = await import('../src/app');
    app = imported.default;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    await Delivery.deleteMany({});
  });

  it('returns 401 when authorization token is missing', async () => {
    const response = await request(app)
      .put('/api/v1/deliveries/507f1f77bcf86cd799439011/status')
      .send({ status: 'assigned' });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('status', 'error');
    expect(response.body.message).toMatch(/Authorization header missing or malformed/i);
  });

  it('updates delivery status after a valid transition', async () => {
    const delivery = await Delivery.create({
      customerName: 'Alice',
      pickupLocation: '123 Market St',
      dropoffLocation: '456 Park Ave',
      packageDetails: 'Small parcel',
      status: 'pending',
    });

    const token = buildToken('driver');

    const response = await request(app)
      .put(`/api/v1/deliveries/${delivery._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'assigned' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'success');
    expect(response.body.data).toHaveProperty('status', 'assigned');

    const updated = await Delivery.findById(delivery._id);
    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('assigned');
  });

  it('returns 400 for invalid status transitions', async () => {
    const delivery = await Delivery.create({
      customerName: 'Alice',
      pickupLocation: '123 Market St',
      dropoffLocation: '456 Park Ave',
      packageDetails: 'Small parcel',
      status: 'pending',
    });

    const token = buildToken('driver');

    const response = await request(app)
      .put(`/api/v1/deliveries/${delivery._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'delivered' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('status', 'error');
    expect(response.body.message).toMatch(/Invalid status transition/i);
  });
});
