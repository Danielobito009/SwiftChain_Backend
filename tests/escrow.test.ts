/**
 * Integration tests for GET /api/v1/escrow/delivery/:id
 *
 * Runs against an in-memory MongoDB instance — every assertion is made on data
 * that was actually persisted and read back through the Mongoose models, so the
 * controller -> service -> model path is exercised end to end.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import { Delivery, DeliveryStatus, IDelivery } from '../src/models/Delivery';
import { Escrow, EscrowStatus } from '../src/models/Escrow';

jest.mock('../src/config/database', () => ({
  connectDatabase: jest.fn(),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Promise.all([Delivery.deleteMany({}), Escrow.deleteMany({})]);
});

const seedDelivery = async (overrides: Record<string, unknown> = {}): Promise<IDelivery> =>
  Delivery.create({
    deliveryId: 'DLV-ESCROW-1',
    trackingNumber: `SWIFT-${Date.now()}`,
    status: DeliveryStatus.IN_PROGRESS,
    escrowAmount: 150,
    deliveryFee: 12.5,
    ...overrides,
  });

describe('GET /api/v1/escrow/delivery/:id', () => {
  it('returns the escrow document for a delivery looked up by _id', async () => {
    const delivery = await seedDelivery();
    await Escrow.create({
      delivery: delivery._id,
      status: EscrowStatus.LOCKED,
      amount: 150,
      assetCode: 'xlm',
      contractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
      payerAddress: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
      lockTransactionHash: 'a'.repeat(64),
      lockedAt: new Date('2026-01-04T10:12:31.000Z'),
      lastSyncedLedger: 1240331,
    });

    const res = await request(app).get(`/api/v1/escrow/delivery/${String(delivery._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.escrow).toMatchObject({
      status: EscrowStatus.LOCKED,
      amount: 150,
      assetCode: 'XLM',
      lastSyncedLedger: 1240331,
      isFundsLocked: true,
      isSettled: false,
    });
    expect(res.body.data.escrow.id).toBeDefined();
    expect(res.body.data.escrow._id).toBeUndefined();
    expect(res.body.data.escrow.__v).toBeUndefined();
    expect(res.body.data.delivery).toMatchObject({
      id: String(delivery._id),
      deliveryId: 'DLV-ESCROW-1',
      status: DeliveryStatus.IN_PROGRESS,
      escrowAmount: 150,
      isArchived: false,
    });
  });

  it('resolves a delivery by its business deliveryId key', async () => {
    const delivery = await seedDelivery({ deliveryId: 'DLV-BUSINESS-KEY' });
    await Escrow.create({
      delivery: delivery._id,
      status: EscrowStatus.PENDING,
      amount: 42,
      assetCode: 'USDC',
    });

    const res = await request(app).get('/api/v1/escrow/delivery/DLV-BUSINESS-KEY');

    expect(res.status).toBe(200);
    expect(res.body.data.escrow).toMatchObject({
      status: EscrowStatus.PENDING,
      amount: 42,
      assetCode: 'USDC',
      isFundsLocked: false,
      isSettled: false,
    });
  });

  it('flags settled escrows as no longer holding funds', async () => {
    const delivery = await seedDelivery({ status: DeliveryStatus.COMPLETED });
    await Escrow.create({
      delivery: delivery._id,
      status: EscrowStatus.RELEASED,
      amount: 150,
      assetCode: 'XLM',
      releaseTransactionHash: 'b'.repeat(64),
      releasedAt: new Date(),
    });

    const res = await request(app).get(`/api/v1/escrow/delivery/${String(delivery._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.data.escrow.isFundsLocked).toBe(false);
    expect(res.body.data.escrow.isSettled).toBe(true);
  });

  it('returns 404 when the delivery exists but has no escrow record', async () => {
    const delivery = await seedDelivery();

    const res = await request(app).get(`/api/v1/escrow/delivery/${String(delivery._id)}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('No escrow record');
  });

  it('returns 404 when the delivery does not exist', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const res = await request(app).get(`/api/v1/escrow/delivery/${missingId}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('not found');
  });

  it('returns 400 when the delivery identifier is malformed', async () => {
    const res = await request(app).get('/api/v1/escrow/delivery/not$a$valid$id');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors[0]).toMatchObject({ location: 'params', field: 'id' });
  });
});
