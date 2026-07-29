import { Server as SocketIOServer } from 'socket.io';
import logger from '../config/logger';
import { locationService, deliveryRoom } from './location.service';
import {
  DriverLocationUpdatePayload,
  TypedSocket,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from './socket.types';

/**
 * Typed Socket.IO server alias.
 */
type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Register the real-time location broadcast event handlers on a connected socket.
 *
 * Responsibilities (controller layer):
 *   - Guard: reject unauthenticated drivers before processing.
 *   - Listen for `driver_location_update` from the driver.
 *   - Delegate to LocationService for persistence + broadcast.
 *   - Emit `location_update_ack` back to the driver.
 *   - Handle `subscribe_delivery` / `unsubscribe_delivery` to manage
 *     delivery room membership for tracking clients (dispatchers, customers).
 *
 * @param io     - The Socket.IO server instance (needed by the service to broadcast).
 * @param socket - The connected socket to register handlers on.
 */
export function registerLocationHandler(io: TypedServer, socket: TypedSocket): void {
  // ── driver_location_update ───────────────────────────────────────────────
  socket.on('driver_location_update', async (payload: DriverLocationUpdatePayload) => {
    const driverId = socket.data.userId;

    // Auth guard
    if (!driverId) {
      logger.warn(
        `[LocationHandler] Unauthenticated driver_location_update — ` + `socketId=${socket.id}`,
      );
      socket.emit('location_update_ack', {
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Payload guard
    if (!payload || typeof payload !== 'object') {
      logger.warn(
        `[LocationHandler] Malformed payload from driverId=${driverId} ` + `socketId=${socket.id}`,
      );
      socket.emit('location_update_ack', {
        success: false,
        error: 'Malformed payload',
      });
      return;
    }

    logger.debug(
      `[LocationHandler] driver_location_update — driverId=${driverId} ` +
        `deliveryId=${payload.deliveryId} socketId=${socket.id}`,
    );

    try {
      const ack = await locationService.processLiveUpdate(io, driverId, payload);
      socket.emit('location_update_ack', ack);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      logger.error(`[LocationHandler] Unexpected error — driverId=${driverId}: ${message}`, {
        stack: err instanceof Error ? err.stack : undefined,
      });
      socket.emit('location_update_ack', { success: false, error: message });
    }
  });

  // ── subscribe_delivery ───────────────────────────────────────────────────
  // Allows any client (dispatcher, customer) to subscribe to a delivery room
  // and receive live `location:update` broadcasts.
  socket.on('join_room', (room: string) => {
    // Delivery room joins are validated here to ensure the room name follows
    // the expected format. Generic room joins (non-delivery) pass through.
    if (room.startsWith('delivery:')) {
      const deliveryId = room.replace('delivery:', '');
      if (!deliveryId) {
        logger.warn(`[LocationHandler] Empty deliveryId in join_room — socketId=${socket.id}`);
        return;
      }
      logger.info(
        `[LocationHandler] Socket subscribed to delivery room — ` +
          `socketId=${socket.id} room="${room}"`,
      );
    }
    // Actual join is handled by connectionHandler's join_room listener;
    // this handler only adds delivery-specific logging/validation.
  });
}

/**
 * Helper exposed for use in tests and other services to build delivery
 * room names consistently.
 *
 * @param deliveryId - MongoDB ObjectId string of the delivery.
 * @returns            The canonical room name, e.g. "delivery:abc123".
 */
export { deliveryRoom };
