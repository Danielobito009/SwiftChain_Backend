import { Types } from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import logger from '../config/logger';
import { LocationUpdate } from '../models/LocationUpdate';
import {
  DriverLocationUpdatePayload,
  LocationBroadcastPayload,
  LocationUpdateAck,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './socket.types';

/**
 * Room name prefix for delivery-scoped broadcast rooms.
 * Clients subscribe to `delivery:<deliveryId>` to receive live updates.
 */
export const DELIVERY_ROOM_PREFIX = 'delivery:';

/**
 * Build the canonical Socket.IO room name for a delivery.
 */
export function deliveryRoom(deliveryId: string): string {
  return `${DELIVERY_ROOM_PREFIX}${deliveryId}`;
}

/**
 * Typed Socket.IO server alias used by the service.
 */
type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * LocationService handles all business logic for real-time driver location
 * broadcasting.
 *
 * Responsibilities:
 *   - Validate incoming `driver_location_update` payloads.
 *   - Persist the live update to MongoDB (reusing the `LocationUpdate` model,
 *     isOfflineSync = false).
 *   - Build the broadcast payload and emit `location:update` to the delivery
 *     room so all subscribed clients receive it.
 *   - Return a typed `LocationUpdateAck` to the controller.
 */
export class LocationService {
  /**
   * Process a live driver location update:
   *   1. Validate the payload.
   *   2. Persist to MongoDB.
   *   3. Broadcast to the delivery room.
   *   4. Return an ack.
   *
   * @param io        - The Socket.IO server (needed to emit to rooms).
   * @param driverId  - Authenticated driver's userId from socket.data.
   * @param payload   - The raw `driver_location_update` payload.
   * @returns           A `LocationUpdateAck` (never throws — errors are caught).
   */
  public async processLiveUpdate(
    io: TypedServer,
    driverId: string,
    payload: DriverLocationUpdatePayload,
  ): Promise<LocationUpdateAck> {
    // ── 1. Validate ──────────────────────────────────────────────────────────
    const validationError = this.validatePayload(payload, driverId);
    if (validationError) {
      logger.warn(`[Location] Invalid payload from driverId=${driverId}: ${validationError}`);
      return { success: false, error: validationError };
    }

    const capturedAt = payload.capturedAt ?? Date.now();
    const receivedAt = new Date().toISOString();

    // ── 2. Persist ───────────────────────────────────────────────────────────
    let locationId: string | undefined;

    try {
      const doc = await LocationUpdate.create({
        driverId: new Types.ObjectId(driverId),
        deliveryId: new Types.ObjectId(payload.deliveryId),
        coordinates: { lat: payload.lat, lng: payload.lng },
        capturedAt: new Date(capturedAt),
        isOfflineSync: false,
        status: 'pending',
      });

      locationId = doc._id.toString();

      logger.debug(
        `[Location] Persisted live update — driverId=${driverId} ` +
          `deliveryId=${payload.deliveryId} locationId=${locationId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'DB write error';
      logger.error(
        `[Location] Failed to persist update — driverId=${driverId} ` +
          `deliveryId=${payload.deliveryId}: ${message}`,
      );
      return { success: false, error: message };
    }

    // ── 3. Broadcast to delivery room ────────────────────────────────────────
    const room = deliveryRoom(payload.deliveryId);

    const broadcastPayload: LocationBroadcastPayload = {
      deliveryId: payload.deliveryId,
      driverId,
      lat: payload.lat,
      lng: payload.lng,
      capturedAt,
      receivedAt,
    };

    io.to(room).emit('location:update', broadcastPayload);

    logger.info(
      `[Location] Broadcast location:update — deliveryId=${payload.deliveryId} ` +
        `driverId=${driverId} room="${room}" lat=${payload.lat} lng=${payload.lng}`,
    );

    // ── 4. Return ack ────────────────────────────────────────────────────────
    return { success: true, locationId };
  }

  /**
   * Validate a live location update payload.
   *
   * @returns An error string if invalid, or null if valid.
   */
  private validatePayload(payload: DriverLocationUpdatePayload, driverId: string): string | null {
    if (!Types.ObjectId.isValid(driverId)) {
      return `Invalid driverId: ${driverId}`;
    }

    if (!payload.deliveryId || !Types.ObjectId.isValid(payload.deliveryId)) {
      return `deliveryId is missing or not a valid ObjectId: ${payload.deliveryId}`;
    }

    if (typeof payload.lat !== 'number' || !Number.isFinite(payload.lat)) {
      return 'lat must be a finite number';
    }
    if (payload.lat < -90 || payload.lat > 90) {
      return `lat out of range: ${payload.lat}`;
    }

    if (typeof payload.lng !== 'number' || !Number.isFinite(payload.lng)) {
      return 'lng must be a finite number';
    }
    if (payload.lng < -180 || payload.lng > 180) {
      return `lng out of range: ${payload.lng}`;
    }

    if (
      payload.capturedAt !== undefined &&
      (typeof payload.capturedAt !== 'number' ||
        !Number.isFinite(payload.capturedAt) ||
        payload.capturedAt <= 0)
    ) {
      return 'capturedAt must be a positive finite number (ms epoch) if provided';
    }

    return null;
  }
}

/** Singleton instance shared across the sockets layer. */
export const locationService = new LocationService();
