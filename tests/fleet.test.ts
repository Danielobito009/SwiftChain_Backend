import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import User from '../src/models/User';
import Fleet from '../src/models/Fleet';
import { UserRole, UserStatus } from '../src/interfaces/IUser';

// ─── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../src/config/database', () => ({
  connectDatabase: jest.fn(),
}));

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

// ─── In-memory MongoDB ─────────────────────────────────────────────────────────

let mongoServer: MongoMemoryServer;

const SETUP_TIMEOUT = 120_000;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, SETUP_TIMEOUT);

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
}, 15_000);

// ─── Helpers ───────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-key';

const signToken = (userId: string): string =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });

const createUser = async (
  overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: UserRole;
    status: UserStatus;
  }> = {},
): Promise<InstanceType<typeof User>> => {
  return User.create({
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'User',
    email: overrides.email ?? `user-${Date.now()}-${Math.random()}@example.com`,
    password: overrides.password ?? 'Password123!',
    role: overrides.role ?? UserRole.USER,
    status: overrides.status ?? UserStatus.ACTIVE,
  });
};

beforeEach(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

// ─── POST /api/v1/fleets ───────────────────────────────────────────────────────

describe('POST /api/v1/fleets', () => {
  describe('201 – successful creation', () => {
    it('creates a fleet for an enterprise user', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'City Logistics Fleet' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.fleet.name).toBe('City Logistics Fleet');
    });

    it('persists the fleet to the database with the correct owner', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Persisted Fleet' });

      const fleet = await Fleet.findOne({ name: 'Persisted Fleet' });
      expect(fleet).not.toBeNull();
      expect(fleet?.ownerId.toString()).toBe(owner._id.toString());
      expect(fleet?.drivers).toEqual([]);
    });

    it('trims whitespace from the fleet name', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '  Trimmed Fleet  ' });

      expect(res.body.data.fleet.name).toBe('Trimmed Fleet');
    });
  });

  describe('400 – validation errors', () => {
    it('returns 400 when name is missing', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when name is a single character', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'A' });

      expect(res.status).toBe(400);
    });
  });

  describe('401 – authentication errors', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app).post('/api/v1/fleets').send({ name: 'No Auth Fleet' });
      expect(res.status).toBe(401);
    });
  });

  describe('403 – authorisation errors', () => {
    it('returns 403 when a regular user tries to create a fleet', async () => {
      const user = await createUser({ role: UserRole.USER });
      const token = signToken(user._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Unauthorized Fleet' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when a driver tries to create a fleet', async () => {
      const driver = await createUser({ role: UserRole.DRIVER });
      const token = signToken(driver._id.toString());

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Driver Fleet' });

      expect(res.status).toBe(403);
    });
  });

  describe('409 – conflict', () => {
    it('returns 409 when the owner already has a fleet with the same name', async () => {
      const owner = await createUser({ role: UserRole.ENTERPRISE });
      const token = signToken(owner._id.toString());

      await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Duplicate Fleet' });

      const res = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Duplicate Fleet' });

      expect(res.status).toBe(409);
    });

    it('allows two different owners to use the same fleet name', async () => {
      const ownerA = await createUser({ role: UserRole.ENTERPRISE });
      const ownerB = await createUser({ role: UserRole.ENTERPRISE });
      const tokenA = signToken(ownerA._id.toString());
      const tokenB = signToken(ownerB._id.toString());

      const resA = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Shared Name Fleet' });
      const resB = await request(app)
        .post('/api/v1/fleets')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Shared Name Fleet' });

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);
    });
  });
});
