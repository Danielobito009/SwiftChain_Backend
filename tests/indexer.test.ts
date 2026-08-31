import request from 'supertest';
import app from '../src/app';
import { Delivery } from '../src/models/Delivery';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Delivery.deleteMany({});
});

describe('Indexer API', () => {
  it('should update delivery correctly on delivery_created event', async () => {
    // Create a dummy delivery in DB
    const delivery = await Delivery.create({
      deliveryId: 'D-12345',
      status: 'Pending'
    });

    // Mock stellar-sdk to avoid complex XDR crafting
    const stellarSdk = require('@stellar/stellar-sdk');
    jest.spyOn(stellarSdk.xdr.ScVal, 'fromXDR').mockReturnValue({} as any);
    jest.spyOn(stellarSdk, 'scValToNative').mockReturnValue({
      delivery_id: 'D-12345',
      contract_id: 'C-XYZ-789'
    });

    const response = await request(app)
      .post('/api/v1/indexer/delivery-created')
      .send({ payload: 'dummy-base64-payload' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Verify DB update
    const updated = await Delivery.findOne({ deliveryId: 'D-12345' });
    expect(updated?.status).toBe('Assigned');
    expect(updated?.contractId).toBe('C-XYZ-789');
  });
});
