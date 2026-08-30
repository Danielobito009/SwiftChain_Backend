import request from 'supertest';
import { StatusCodes } from 'http-status-codes';
import app from '../src/app';
import AuditLog from '../src/models/AuditLog';
import { clearTestDatabase, closeTestDatabase, connectTestDatabase } from './helpers/testDatabase';
import { authHeaderFor, createDelivery, createEscrow, createUser } from './helpers/factories';

// `app.ts` opens its own connection on import; the suite drives an in-memory
// server instead, so the real connector is stubbed out.
jest.mock('../src/config/database', () => ({ connectDatabase: jest.fn() }));

jest.mock('../src/config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

beforeAll(connectTestDatabase);
afterEach(clearTestDatabase);
afterAll(closeTestDatabase);

describe('Authentication endpoints', () => {
  it('registers a user and returns a token without the password hash', async () => {
    const { body } = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@swiftchain.test', password: 'S3cureP@ss' })
      .expect(StatusCodes.CREATED);

    expect(body.status).toBe('success');
    expect(body.data.token).toEqual(expect.any(String));
    expect(body.data.user.email).toBe('ada@swiftchain.test');
    expect(body.data.user).not.toHaveProperty('password');
  });

  it('rejects a duplicate email with 409', async () => {
    await createUser({ email: 'taken@swiftchain.test' });

    const { body } = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Someone', email: 'taken@swiftchain.test', password: 'S3cureP@ss' })
      .expect(StatusCodes.CONFLICT);

    expect(body.message).toMatch(/already exists/i);
  });

  it('authenticates valid credentials', async () => {
    await createUser({ email: 'login@swiftchain.test', password: 'S3cureP@ss' });

    const { body } = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@swiftchain.test', password: 'S3cureP@ss' })
      .expect(StatusCodes.OK);

    expect(body.data.token).toEqual(expect.any(String));
  });

  it('returns an identical message for a wrong password and an unknown account', async () => {
    await createUser({ email: 'known@swiftchain.test', password: 'S3cureP@ss' });

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'known@swiftchain.test', password: 'WrongPassword' })
      .expect(StatusCodes.UNAUTHORIZED);

    const unknownAccount = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@swiftchain.test', password: 'S3cureP@ss' })
      .expect(StatusCodes.UNAUTHORIZED);

    // Identical wording keeps the endpoint from confirming which accounts exist.
    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
  });

  it('refuses a suspended account', async () => {
    await createUser({
      email: 'suspended@swiftchain.test',
      password: 'S3cureP@ss',
      status: 'suspended',
    });

    const { body } = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'suspended@swiftchain.test', password: 'S3cureP@ss' })
      .expect(StatusCodes.FORBIDDEN);

    expect(body.message).toMatch(/suspended/i);
  });

  it('rejects a malformed body with 400', async () => {
    const { body } = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' })
      .expect(StatusCodes.BAD_REQUEST);

    expect(body.status).toBe('error');
  });
});

describe('Authorization', () => {
  it('rejects an unauthenticated request with 401', async () => {
    await request(app).get('/api/v1/users').expect(StatusCodes.UNAUTHORIZED);
  });

  it('rejects a malformed token with 401', async () => {
    await request(app)
      .get('/api/v1/users')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(StatusCodes.UNAUTHORIZED);
  });

  it('rejects a non-admin caller with 403', async () => {
    const user = await createUser({ role: 'user' });

    await request(app)
      .get('/api/v1/users')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.FORBIDDEN);
  });
});

describe('GET /api/v1/users', () => {
  it('returns a page of users with pagination metadata from the database', async () => {
    const admin = await createUser({ role: 'admin' });
    await Promise.all(Array.from({ length: 12 }, () => createUser()));

    const { body } = await request(app)
      .get('/api/v1/users?page=2&limit=5')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.data).toHaveLength(5);
    // 12 created users plus the admin.
    expect(body.meta).toMatchObject({
      totalItems: 13,
      totalPages: 3,
      currentPage: 2,
      limit: 5,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(body.data[0]).not.toHaveProperty('password');
  });

  it('filters by role', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser({ role: 'driver' });
    await createUser({ role: 'user' });

    const { body } = await request(app)
      .get('/api/v1/users?role=driver')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(1);
    expect(body.data[0].role).toBe('driver');
  });

  it('searches by name', async () => {
    const admin = await createUser({ role: 'admin' });
    await createUser({ name: 'Grace Hopper' });
    await createUser({ name: 'Alan Turing' });

    const { body } = await request(app)
      .get('/api/v1/users?search=grace')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(1);
    expect(body.data[0].name).toBe('Grace Hopper');
  });

  it('rejects a sort on a field outside the allow-list', async () => {
    const admin = await createUser({ role: 'admin' });

    await request(app)
      .get('/api/v1/users?sort=password')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.BAD_REQUEST);
  });
});

describe('GET /api/v1/deliveries', () => {
  it('paginates and sorts deliveries from the database', async () => {
    const user = await createUser();
    await createDelivery(user, { amount: 100 });
    await createDelivery(user, { amount: 300 });
    await createDelivery(user, { amount: 200 });

    const { body } = await request(app)
      .get('/api/v1/deliveries?sort=-amount&limit=2')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.OK);

    expect(body.data).toHaveLength(2);
    expect(body.data.map((item: { amount: number }) => item.amount)).toEqual([300, 200]);
    expect(body.meta).toMatchObject({ totalItems: 3, totalPages: 2, hasNextPage: true });
  });

  it('applies a range filter', async () => {
    const user = await createUser();
    await createDelivery(user, { amount: 50 });
    await createDelivery(user, { amount: 150 });
    await createDelivery(user, { amount: 250 });

    const { body } = await request(app)
      .get('/api/v1/deliveries?amount[gte]=150')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(2);
  });

  it('filters by status', async () => {
    const user = await createUser();
    await createDelivery(user, { status: 'delivered' });
    await createDelivery(user, { status: 'pending' });

    const { body } = await request(app)
      .get('/api/v1/deliveries?status=delivered')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(1);
    expect(body.data[0].status).toBe('delivered');
  });

  it('populates the sender reference', async () => {
    const user = await createUser({ name: 'Ada Lovelace' });
    await createDelivery(user);

    const { body } = await request(app)
      .get('/api/v1/deliveries')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.OK);

    expect(body.data[0].sender.name).toBe('Ada Lovelace');
  });

  it('returns 404 for a delivery that does not exist', async () => {
    const user = await createUser();

    await request(app)
      .get('/api/v1/deliveries/6531f3b2c1a4e8f2b7d9a999')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.NOT_FOUND);
  });

  it('returns 400 for a malformed identifier', async () => {
    const user = await createUser();

    await request(app)
      .get('/api/v1/deliveries/not-an-id')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.BAD_REQUEST);
  });
});

describe('Escrow settlement', () => {
  it('refunds an escrow and writes an audit entry', async () => {
    const admin = await createUser({ role: 'admin' });
    const payer = await createUser();
    const payee = await createUser();
    const delivery = await createDelivery(payer);
    const escrow = await createEscrow(delivery, payer, payee, { status: 'funded' });

    const { body } = await request(app)
      .post(`/api/v1/escrows/${escrow.id}/refund`)
      .set('Authorization', authHeaderFor(admin))
      .send({ reason: 'Delivery never collected' })
      .expect(StatusCodes.OK);

    expect(body.data.status).toBe('refunded');

    const entry = await AuditLog.findOne({ targetId: escrow._id }).exec();
    expect(entry?.action).toBe('escrow.refunded');
    expect(entry?.admin.toString()).toBe(admin.id);
    expect(entry?.reason).toBe('Delivery never collected');
  });

  it('refuses to settle an already-settled escrow', async () => {
    const admin = await createUser({ role: 'admin' });
    const payer = await createUser();
    const payee = await createUser();
    const delivery = await createDelivery(payer);
    const escrow = await createEscrow(delivery, payer, payee, { status: 'released' });

    await request(app)
      .post(`/api/v1/escrows/${escrow.id}/refund`)
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.CONFLICT);
  });

  it('denies settlement to a non-admin caller', async () => {
    const user = await createUser({ role: 'user' });
    const payee = await createUser();
    const delivery = await createDelivery(user);
    const escrow = await createEscrow(delivery, user, payee);

    await request(app)
      .post(`/api/v1/escrows/${escrow.id}/release`)
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.FORBIDDEN);
  });
});

describe('GET /api/v1/audit-logs', () => {
  it('exposes the trail to admins with pagination metadata', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await request(app)
      .patch(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', authHeaderFor(admin))
      .send({ reason: 'Policy violation' })
      .expect(StatusCodes.OK);

    const { body } = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(1);
    expect(body.data[0].action).toBe('user.suspended');
    // The acting admin is populated for display.
    expect(body.data[0].admin.email).toBe(admin.email);
  });

  it('returns the trail for a single target record', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await request(app)
      .patch(`/api/v1/users/${target.id}/role`)
      .set('Authorization', authHeaderFor(admin))
      .send({ role: 'driver' })
      .expect(StatusCodes.OK);

    const { body } = await request(app)
      .get(`/api/v1/audit-logs/User/${target.id}`)
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.meta.totalItems).toBe(1);
    expect(body.data[0].action).toBe('user.role_changed');
  });

  it('rejects an unrecognized target type', async () => {
    const admin = await createUser({ role: 'admin' });

    await request(app)
      .get('/api/v1/audit-logs/Wallet/6531f3b2c1a4e8f2b7d9a999')
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.BAD_REQUEST);
  });

  it('denies access to non-admin callers', async () => {
    const user = await createUser({ role: 'user' });

    await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', authHeaderFor(user))
      .expect(StatusCodes.FORBIDDEN);
  });
});

describe('Admin user actions', () => {
  it('suspends and then reinstates an account', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser({ status: 'active' });

    await request(app)
      .patch(`/api/v1/users/${target.id}/suspend`)
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    const { body } = await request(app)
      .patch(`/api/v1/users/${target.id}/reinstate`)
      .set('Authorization', authHeaderFor(admin))
      .expect(StatusCodes.OK);

    expect(body.data.status).toBe('active');
    await expect(AuditLog.countDocuments({}).exec()).resolves.toBe(2);
  });

  it('rejects an unrecognized role', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await request(app)
      .patch(`/api/v1/users/${target.id}/role`)
      .set('Authorization', authHeaderFor(admin))
      .send({ role: 'superuser' })
      .expect(StatusCodes.BAD_REQUEST);
  });
});
