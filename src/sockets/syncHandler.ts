import logger from '../config/logger';
import { syncService } from './sync.service';
import { LocationSyncPayload, TypedSocket } from './socket.types';

/**
 * Register the offline sync event handlers on a connected socket.
 *
 * Responsibilities (controller layer):
 *   - Listen for the `location_sync` event from the driver.
 *   - Validate that the socket has an authenticated userId before processing.
 *   - Delegate batch processing to SyncService.
 *   - Emit `location_sync_ack` back to the client.
 *   - Catch and log any unexpected errors without crashing the process.
 *
 * @param socket - The authenticated driver socket.
 */
export function registerSyncHandler(socket: TypedSocket): void {
  socket.on('location_sync', async (payload: LocationSyncPayload) => {
    const driverId = socket.data.userId;

    // ── Auth guard ─────────────────────────────────────────────────────────
    if (!driverId) {
      logger.warn(`[SyncHandler] Unauthenticated location_sync attempt — socketId=${socket.id}`);
      socket.emit('location_sync_ack', {
        processedAt: new Date().toISOString(),
        received: 0,
        saved: 0,
        duplicates: 0,
        failed: 0,
        results: [],
      });
      return;
    }

    // ── Payload guard ──────────────────────────────────────────────────────
    if (!payload || !Array.isArray(payload.updates)) {
      logger.warn(
        `[SyncHandler] Malformed payload from driverId=${driverId} socketId=${socket.id}`,
      );
      socket.emit('location_sync_ack', {
        processedAt: new Date().toISOString(),
        received: 0,
        saved: 0,
        duplicates: 0,
        failed: 0,
        results: [],
      });
      return;
    }

    logger.info(
      `[SyncHandler] location_sync received — driverId=${driverId} ` +
        `count=${payload.updates.length} socketId=${socket.id}`,
    );

    try {
      // ── Delegate to service layer ────────────────────────────────────────
      const ack = await syncService.processBatch(driverId, payload);

      // ── Acknowledge to client ────────────────────────────────────────────
      socket.emit('location_sync_ack', ack);

      logger.info(
        `[SyncHandler] location_sync_ack sent — driverId=${driverId} ` +
          `saved=${ack.saved} dupes=${ack.duplicates} failed=${ack.failed}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error during sync';
      logger.error(`[SyncHandler] Error processing sync for driverId=${driverId}: ${message}`, {
        stack: err instanceof Error ? err.stack : undefined,
      });

      // Emit a failed ack so the client knows to retry
      socket.emit('location_sync_ack', {
        processedAt: new Date().toISOString(),
        received: payload.updates.length,
        saved: 0,
        duplicates: 0,
        failed: payload.updates.length,
        results: payload.updates.map((p) => ({
          capturedAt: p.capturedAt ?? 0,
          status: 'error' as const,
          reason: message,
        })),
      });
    }
  });
}
