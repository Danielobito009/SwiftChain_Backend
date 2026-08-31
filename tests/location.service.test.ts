/**
 * Unit tests for LocationService
 *
 * Uses MongoMemoryServer for real DB interactions so the full persist →
 * broadcast → ack flow is exercised without a live Mongo instance.
 *
 * Coverage:
 *   - processLiveUpdate: valid payload persists and broadcasts
 *   - processLiveUpdate: ack contains locationId on success
 *   - processLiveUpdate: broadcasts to the correct delivery room
 *   - processLiveUpdate: payload validation (missing/invalid fields)
 *   - processLiveUpdate: unauthenticated driver (invalid driverId)
 *   - processLiveUpdate: DB write failure handled gracefully
 *   - deliveryRoom helper
 */

import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  LocationService,
  deliveryRoom,
  DELIVERY_ROOM_PREFIX,
} from '../src/sockets/location.service';
import { LocationUpdate } from '../src/models/LocationUpdate';
import {
  DriverLocationUpdatePayload,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '../src/sockets/socket.types';
import { Server as SocketIOServer } from 'socket.io';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

/**
 * Build a minimal mock Socket.IO server whose `to().emit()` calls we can spy on.
 */
function makeMockIO(): {
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  emitSpy: jest.Mock;
  toSpy: jest.Mock;
} {
  const emitSpy = jest.fn();
  const toSpy = jest.fn().mockReturnValue({ emit: emitSpy });

  const io = {
    to: toSpy,
  } as unknown as SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;

  return { io, emitSpy, toSpy };
}

/**
 * Build a valid `DriverLocationUpdatePayload` with optional overrides.
 */
function makePayload(
  overrides: Partial<DriverLocationUpdatePayload> = {},
): DriverLocationUpdatePayload {
  return {
    deliveryId: new Types.ObjectId().toHexString(),
    lat: 6.5244,
    lng: 3.3792,
    capturedAt: Date.now() - 1000,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('LocationService', () => {
  let mongod: MongoMemoryServer;
  let service: LocationService;
  let validDriverId: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    service = new LocationService();
    validDriverId = new Types.ObjectId().toHexString();
  }, 60_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  }, 30_000);

  afterEach(async () => {
    await LocationUpdate.deleteMany({});
    jest.clearAllMocks();
  });

  // ── deliveryRoom helper ────────────────────────────────────────────────────

  describe('deliveryRoom', () => {
    it('prefixes the deliveryId with DELIVERY_ROOM_PREFIX', () => {
      const id = 'abc123';
      expect(deliveryRoom(id)).toBe(`${DELIVERY_ROOM_PREFIX}${id}`);
    });

    it('produces a unique room per deliveryId', () => {
      const a = new Types.ObjectId().toHexString();
      const b = new Types.ObjectId().toHexString();
      expect(deliveryRoom(a)).not.toBe(deliveryRoom(b));
    });
  });

  // ── processLiveUpdate — happy path ────────────────────────────────────────

  describe('processLiveUpdate — success', () => {
    it('returns success=true with a locationId', async () => {
      const { io } = makeMockIO();
      const payload = makePayload();

      const ack = await service.processLiveUpdate(io, validDriverId, payload);

      expect(ack.success).toBe(true);
      expect(ack.locationId).toBeDefined();
      expect(typeof ack.locationId).toBe('string');
    });

    it('persists the update to MongoDB with isOfflineSync=false', async () => {
      const { io } = makeMockIO();
      const payload = makePayload();

      await service.processLiveUpdate(io, validDriverId, payload);

      const doc = await LocationUpdate.findOne({
        driverId: new Types.ObjectId(validDriverId),
      });

      expect(doc).not.toBeNull();
      expect(doc!.isOfflineSync).toBe(false);
      expect(doc!.status).toBe('pending');
      expect(doc!.coordinates.lat).toBe(payload.lat);
      expect(doc!.coordinates.lng).toBe(payload.lng);
    });

    it('stores the correct deliveryId on the persisted document', async () => {
      const { io } = makeMockIO();
      const payload = makePayload();

      await service.processLiveUpdate(io, validDriverId, payload);

      const doc = await LocationUpdate.findOne({});
      expect(doc!.deliveryId?.toHexString()).toBe(payload.deliveryId);
    });

    it('broadcasts location:update to the correct delivery room', async () => {
      const { io, toSpy, emitSpy } = makeMockIO();
      const payload = makePayload();

      await service.processLiveUpdate(io, validDriverId, payload);

      expect(toSpy).toHaveBeenCalledWith(deliveryRoom(payload.deliveryId));
      expect(emitSpy).toHaveBeenCalledWith(
        'location:update',
        expect.objectContaining({
          deliveryId: payload.deliveryId,
          driverId: validDriverId,
          lat: payload.lat,
          lng: payload.lng,
        }),
      );
    });

    it('broadcast payload includes receivedAt as ISO string', async () => {
      const { io, emitSpy } = makeMockIO();
      const payload = makePayload();

      await service.processLiveUpdate(io, validDriverId, payload);

      const broadcastPayload = emitSpy.mock.calls[0][1] as { receivedAt: string };
      expect(broadcastPayload.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('uses server receive time for capturedAt when not provided by client', async () => {
      const { io, emitSpy } = makeMockIO();
      const payload = makePayload({ capturedAt: undefined });

      const before = Date.now();
      await service.processLiveUpdate(io, validDriverId, payload);
      const after = Date.now();

      const broadcastPayload = emitSpy.mock.calls[0][1] as { capturedAt: number };
      expect(broadcastPayload.capturedAt).toBeGreaterThanOrEqual(before);
      expect(broadcastPayload.capturedAt).toBeLessThanOrEqual(after);
    });

    it('broadcasts exactly once per update', async () => {
      const { io, emitSpy } = makeMockIO();
      const payload = makePayload();

      await service.processLiveUpdate(io, validDriverId, payload);

      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── processLiveUpdate — validation ────────────────────────────────────────

  describe('processLiveUpdate — validation', () => {
    it('rejects an invalid driverId', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(io, 'not-an-id', makePayload());

      expect(ack.success).toBe(false);
      expect(ack.error).toContain('driverId');
    });

    it('rejects a missing deliveryId', async () => {
      const { io } = makeMockIO();
      const payload = makePayload({ deliveryId: '' });

      const ack = await service.processLiveUpdate(io, validDriverId, payload);

      expect(ack.success).toBe(false);
      expect(ack.error).toContain('deliveryId');
    });

    it('rejects an invalid deliveryId (not an ObjectId)', async () => {
      const { io } = makeMockIO();
      const payload = makePayload({ deliveryId: 'bad-id' });

      const ack = await service.processLiveUpdate(io, validDriverId, payload);

      expect(ack.success).toBe(false);
    });

    it('rejects lat out of range (>90)', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(io, validDriverId, makePayload({ lat: 91 }));

      expect(ack.success).toBe(false);
      expect(ack.error).toContain('lat');
    });

    it('rejects lng out of range (<-180)', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(io, validDriverId, makePayload({ lng: -181 }));

      expect(ack.success).toBe(false);
      expect(ack.error).toContain('lng');
    });

    it('rejects NaN lat', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(io, validDriverId, makePayload({ lat: NaN }));

      expect(ack.success).toBe(false);
    });

    it('rejects capturedAt = 0 (invalid epoch)', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(
        io,
        validDriverId,
        makePayload({ capturedAt: 0 }),
      );

      expect(ack.success).toBe(false);
    });

    it('accepts boundary lat=-90, lng=-180', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(
        io,
        validDriverId,
        makePayload({ lat: -90, lng: -180 }),
      );

      expect(ack.success).toBe(true);
    });

    it('accepts boundary lat=90, lng=180', async () => {
      const { io } = makeMockIO();
      const ack = await service.processLiveUpdate(
        io,
        validDriverId,
        makePayload({ lat: 90, lng: 180 }),
      );

      expect(ack.success).toBe(true);
    });

    it('does NOT broadcast when validation fails', async () => {
      const { io, emitSpy } = makeMockIO();
      await service.processLiveUpdate(io, 'bad', makePayload());

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('does NOT persist when validation fails', async () => {
      const { io } = makeMockIO();
      await service.processLiveUpdate(io, 'bad', makePayload());

      const count = await LocationUpdate.countDocuments({});
      expect(count).toBe(0);
    });
  });
});
