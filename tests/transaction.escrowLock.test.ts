/**
 * Tests for POST /api/v1/transactions/escrow-lock and the underlying
 * TransactionService.
 *
 * Deliveries are persisted in an in-memory MongoDB and read back through the
 * Mongoose model, so the contract arguments under assertion are the ones
 * derived from real stored data. Only the Soroban RPC node is stubbed (via
 * constructor injection) so the suite runs offline.
 */

import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Account,
  Address,
  Networks,
  Transaction,
  TransactionBuilder,
  scValToNative,
  xdr,
  rpc as StellarRpc,
} from '@stellar/stellar-sdk';
import app from '../src/app';
import { stellarConfig } from '../src/config/stellar';
import { Delivery, DeliveryStatus, IDelivery } from '../src/models/Delivery';
import { TransactionService } from '../src/services/transactionService';

const CONTRACT_ID = 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K';
const PAYER = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

jest.mock('../src/config/database', () => ({
  connectDatabase: jest.fn(),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// Keep the singleton RPC client from being constructed (no network at import).
jest.mock('../src/config/stellar', () => ({
  stellarConfig: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    network: 'testnet',
    timeoutMs: 10000,
    escrowContractId: 'CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K',
    escrowLockFunction: 'lock_escrow',
    baseFee: '100',
    transactionTimeoutSeconds: 300,
  },
  sorobanRpcClient: {},
  createSorobanRpcClient: jest.fn(),
}));

interface StubbedClient {
  getAccount: jest.Mock;
  prepareTransaction: jest.Mock;
}

const createClient = (overrides: Partial<StubbedClient> = {}): StubbedClient => ({
  getAccount: jest.fn().mockResolvedValue(new Account(PAYER, '100')),
  // The real node returns a transaction assembled from the simulation result;
  // echoing the built transaction preserves every field under assertion.
  prepareTransaction: jest.fn().mockImplementation((tx: Transaction) => Promise.resolve(tx)),
  ...overrides,
});

const serviceWith = (client: StubbedClient): TransactionService =>
  new TransactionService(client as unknown as StellarRpc.Server);

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
  await Delivery.deleteMany({});
  stellarConfig.escrowContractId = CONTRACT_ID;
});

const seedDelivery = async (overrides: Record<string, unknown> = {}): Promise<IDelivery> =>
  Delivery.create({
    deliveryId: 'DLV-XDR-1',
    trackingNumber: `SWIFT-${Date.now()}`,
    status: DeliveryStatus.ASSIGNED,
    escrowAmount: 15.99,
    ...overrides,
  });

/** Decode the single invoke-host-function operation carried by the envelope. */
const readInvocation = (
  envelopeXdr: string,
): { contractId: string; functionName: string; args: unknown[] } => {
  const tx = TransactionBuilder.fromXDR(envelopeXdr, Networks.TESTNET) as Transaction;
  expect(tx.operations).toHaveLength(1);

  const op = tx.operations[0] as { type: string; func: xdr.HostFunction };
  expect(op.type).toBe('invokeHostFunction');

  const invocation = op.func.invokeContract();

  return {
    contractId: Address.fromScAddress(invocation.contractAddress()).toString(),
    functionName: invocation.functionName().toString(),
    args: invocation.args().map((arg: xdr.ScVal) => scValToNative(arg)),
  };
};

describe('TransactionService.buildEscrowLockXdr', () => {
  it('builds an unsigned XDR whose arguments come from the stored delivery', async () => {
    const delivery = await seedDelivery();
    const client = createClient();

    const result = await serviceWith(client).buildEscrowLockXdr({
      deliveryId: String(delivery._id),
      payerAddress: PAYER,
    });

    expect(client.getAccount).toHaveBeenCalledWith(PAYER);
    expect(client.prepareTransaction).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      network: 'testnet',
      contractId: CONTRACT_ID,
      contractFunction: 'lock_escrow',
      sourceAccount: PAYER,
      delivery: { id: String(delivery._id), deliveryId: 'DLV-XDR-1' },
      amount: { value: 15.99, stroops: '159900000', formatted: '15.9900000' },
    });
    expect(result.validUntil).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const invocation = readInvocation(result.xdr);
    expect(invocation.contractId).toBe(CONTRACT_ID);
    expect(invocation.functionName).toBe('lock_escrow');
    expect(invocation.args[0]).toBe(PAYER);
    expect(invocation.args[1]).toBe('DLV-XDR-1');
    // i128 stroops — 15.99 must not drift into 159899999 via float maths.
    expect(invocation.args[2]).toBe(159900000n);
  });

  it('falls back to the document id when the delivery has no business key', async () => {
    const delivery = await seedDelivery({ deliveryId: undefined, escrowAmount: 150 });

    const result = await serviceWith(createClient()).buildEscrowLockXdr({
      deliveryId: String(delivery._id),
      payerAddress: PAYER,
    });

    expect(readInvocation(result.xdr).args[1]).toBe(String(delivery._id));
    expect(result.amount.stroops).toBe('1500000000');
  });

  it('returns 404 when the delivery does not exist', async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    await expect(
      serviceWith(createClient()).buildEscrowLockXdr({
        deliveryId: missingId,
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns 409 when the delivery is already completed', async () => {
    const delivery = await seedDelivery({ status: DeliveryStatus.COMPLETED });

    await expect(
      serviceWith(createClient()).buildEscrowLockXdr({
        deliveryId: String(delivery._id),
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns 422 when the delivery has no positive escrow amount', async () => {
    const delivery = await seedDelivery({ escrowAmount: 0 });

    await expect(
      serviceWith(createClient()).buildEscrowLockXdr({
        deliveryId: String(delivery._id),
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  it('returns 404 when the payer account is not funded on the network', async () => {
    const delivery = await seedDelivery();
    const client = createClient({
      getAccount: jest
        .fn()
        .mockRejectedValue({ code: 404, message: `Account not found: ${PAYER}` }),
    });

    await expect(
      serviceWith(client).buildEscrowLockXdr({
        deliveryId: String(delivery._id),
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns 502 when the simulation is rejected by the RPC node', async () => {
    const delivery = await seedDelivery();
    const client = createClient({
      prepareTransaction: jest.fn().mockRejectedValue(new Error('HostError: contract trapped')),
    });

    await expect(
      serviceWith(client).buildEscrowLockXdr({
        deliveryId: String(delivery._id),
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('returns 503 when no escrow contract is configured', async () => {
    const delivery = await seedDelivery();
    stellarConfig.escrowContractId = undefined;

    await expect(
      serviceWith(createClient()).buildEscrowLockXdr({
        deliveryId: String(delivery._id),
        payerAddress: PAYER,
      }),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('POST /api/v1/transactions/escrow-lock — request validation', () => {
  it('rejects a malformed delivery id', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/escrow-lock')
      .send({ deliveryId: 'not-an-id', payerAddress: PAYER });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ location: 'body', field: 'deliveryId' });
  });

  it('rejects an invalid Stellar public key', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/escrow-lock')
      .send({ deliveryId: new mongoose.Types.ObjectId().toString(), payerAddress: 'GINVALID' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ location: 'body', field: 'payerAddress' });
  });

  it('rejects a request with no body', async () => {
    const res = await request(app).post('/api/v1/transactions/escrow-lock').send({});

    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(
      expect.arrayContaining(['deliveryId', 'payerAddress']),
    );
  });
});
