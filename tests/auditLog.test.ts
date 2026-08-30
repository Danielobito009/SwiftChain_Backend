import AuditLog from '../src/models/AuditLog';
import User from '../src/models/User';
import { listAuditLogs, recordAction } from '../src/services/auditLogService';
import { changeUserRole, suspendUser } from '../src/services/userService';
import { clearTestDatabase, closeTestDatabase, connectTestDatabase } from './helpers/testDatabase';
import { createUser } from './helpers/factories';
import ApiError from '../src/utils/ApiError';

jest.mock('../src/config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

beforeAll(connectTestDatabase);
afterEach(clearTestDatabase);
afterAll(closeTestDatabase);

describe('AuditLog model', () => {
  it('persists an entry with the acting admin, action, target and timestamp', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    const entry = await recordAction({
      adminId: admin.id as string,
      action: 'user.suspended',
      targetType: 'User',
      targetId: target.id as string,
      reason: 'Repeated policy violations',
      ipAddress: '203.0.113.24',
    });

    const stored = await AuditLog.findById(entry.id).exec();

    expect(stored).not.toBeNull();
    expect(stored?.admin.toString()).toBe(admin.id);
    expect(stored?.targetId.toString()).toBe(target.id);
    expect(stored?.action).toBe('user.suspended');
    expect(stored?.targetType).toBe('User');
    expect(stored?.status).toBe('success');
    expect(stored?.reason).toBe('Repeated policy violations');
    expect(stored?.createdAt).toBeInstanceOf(Date);
  });

  it('rejects an action outside the recognized set', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await expect(
      AuditLog.create({
        admin: admin._id,
        action: 'user.hacked',
        targetType: 'User',
        targetId: target._id,
      }),
    ).rejects.toThrow(/not a recognized audit action/);
  });

  it('requires the acting admin and the target', async () => {
    await expect(AuditLog.create({ action: 'user.suspended' })).rejects.toThrow();
  });

  it('refuses updates so the trail stays append-only', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    const entry = await recordAction({
      adminId: admin.id as string,
      action: 'user.suspended',
      targetType: 'User',
      targetId: target.id as string,
    });

    await expect(
      AuditLog.updateOne({ _id: entry._id }, { $set: { action: 'user.reinstated' } }).exec(),
    ).rejects.toThrow(/immutable/i);
  });

  it('refuses deletes so the trail cannot be erased', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await recordAction({
      adminId: admin.id as string,
      action: 'user.suspended',
      targetType: 'User',
      targetId: target.id as string,
    });

    await expect(AuditLog.deleteMany({}).exec()).rejects.toThrow(/immutable/i);
  });
});

describe('Audited admin actions', () => {
  it('records a suspension and applies the status change', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser({ status: 'active' });

    const result = await suspendUser(target.id as string, {
      adminId: admin.id as string,
      reason: 'Fraudulent activity',
      ipAddress: '198.51.100.7',
    });

    expect(result.status).toBe('suspended');

    const persisted = await User.findById(target.id).exec();
    expect(persisted?.status).toBe('suspended');

    const entries = await AuditLog.find({ targetId: target._id }).exec();
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('user.suspended');
    expect(entries[0].admin.toString()).toBe(admin.id);
    expect(entries[0].reason).toBe('Fraudulent activity');
    expect(entries[0].changes).toEqual({ status: { from: 'active', to: 'suspended' } });
  });

  it('records the previous and new value on a role change', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser({ role: 'user' });

    await changeUserRole(target.id as string, 'driver', { adminId: admin.id as string });

    const entry = await AuditLog.findOne({ targetId: target._id }).exec();

    expect(entry?.action).toBe('user.role_changed');
    expect(entry?.changes).toEqual({ role: { from: 'user', to: 'driver' } });
  });

  it('refuses to suspend an already-suspended account', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser({ status: 'suspended' });

    await expect(suspendUser(target.id as string, { adminId: admin.id as string })).rejects.toThrow(
      ApiError,
    );

    // A rejected action must not leave an audit entry behind.
    await expect(AuditLog.countDocuments({}).exec()).resolves.toBe(0);
  });

  it('prevents an admin from suspending their own account', async () => {
    const admin = await createUser({ role: 'admin' });

    await expect(suspendUser(admin.id as string, { adminId: admin.id as string })).rejects.toThrow(
      /cannot suspend their own account/i,
    );
  });

  it('rejects an unknown user without writing an entry', async () => {
    const admin = await createUser({ role: 'admin' });

    await expect(
      suspendUser('6531f3b2c1a4e8f2b7d9a999', { adminId: admin.id as string }),
    ).rejects.toThrow(/not found/i);

    await expect(AuditLog.countDocuments({}).exec()).resolves.toBe(0);
  });
});

describe('Audit log retrieval', () => {
  it('returns entries newest first with pagination metadata', async () => {
    const admin = await createUser({ role: 'admin' });
    const targets = await Promise.all([createUser(), createUser(), createUser()]);

    for (const target of targets) {
      await recordAction({
        adminId: admin.id as string,
        action: 'user.suspended',
        targetType: 'User',
        targetId: target.id as string,
      });
    }

    const result = await listAuditLogs({
      page: 1,
      limit: 2,
      skip: 0,
      sort: { createdAt: -1 },
      filter: {},
    });

    expect(result.items).toHaveLength(2);
    expect(result.meta).toMatchObject({
      totalItems: 3,
      totalPages: 2,
      currentPage: 1,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('filters by action type', async () => {
    const admin = await createUser({ role: 'admin' });
    const target = await createUser();

    await recordAction({
      adminId: admin.id as string,
      action: 'user.suspended',
      targetType: 'User',
      targetId: target.id as string,
    });
    await recordAction({
      adminId: admin.id as string,
      action: 'user.reinstated',
      targetType: 'User',
      targetId: target.id as string,
    });

    const result = await listAuditLogs({
      page: 1,
      limit: 20,
      skip: 0,
      sort: { createdAt: -1 },
      filter: { action: 'user.reinstated' },
    });

    expect(result.items).toHaveLength(1);
    expect(result.meta.totalItems).toBe(1);
  });
});
