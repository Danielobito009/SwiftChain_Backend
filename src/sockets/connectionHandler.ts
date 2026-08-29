import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import logger from '../config/logger';
import { socketService } from './socket.service';
import { registerSyncHandler } from './syncHandler';
import { registerLocationHandler } from './locationHandler';
import {
  PongPayload,
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  TypedSocket,
} from './socket.types';
import jwt from 'jsonwebtoken';

/**
 * Typed Socket.IO server alias used throughout the sockets layer.
 */
export type TypedServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Create and configure a typed Socket.IO server attached to the given
 * HTTP server.
 *
 * Responsibilities (controller layer):
 *   - Attach Socket.IO to the HTTP server with CORS config.
 *   - Register per-socket event handlers.
 *   - Delegate business logic to SocketService.
 *   - Start the health-check loop.
 *
 * @param httpServer - The Node.js HTTP server returned by `app.listen`.
 * @returns           The configured Socket.IO server instance.
 */
export function initializeSocketServer(httpServer: HttpServer): TypedServer {
  const io: TypedServer = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Use Socket.IO's built-in transport-level ping/pong as a fallback
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT_MS ?? '20000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL_MS ?? '25000', 10),
    // Allow only websocket transport in production for efficiency
    transports: process.env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
  });

  // ─── Per-connection setup ──────────────────────────────────────────────────
  io.on('connection', (socket: TypedSocket) => {
    // Extract authentication info from handshake
    const { userId, tokenExp } = extractAuthInfo(socket);

    // Store auth data on socket data
    socket.data.connectedAt = Date.now();
    if (userId) socket.data.userId = userId;
    if (tokenExp) (socket.data as any).tokenExp = tokenExp;

    // Register the connection in the service layer with token expiration
    socketService.registerConnection(socket, userId, tokenExp);

    // ── offline sync handler ─────────────────────────────────────────────────
    registerSyncHandler(socket);

    // ── real-time location broadcast handler ─────────────────────────────────
    registerLocationHandler(io, socket);

    // ── token refresh handler ─────────────────────────────────────────────────────
    socket.on('refresh_token', (payload: { token: string }) => {
      const token = payload?.token;
      if (!token) {
        logger.warn(`[Socket] refresh_token missing token – socketId=${socket.id}`);
        socket.emit('auth_expired');
        socket.disconnect(true);
        return;
      }
      try {
        const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token;
        const decoded = jwt.verify(rawToken, process.env.JWT_SECRET as string) as { userId?: string; exp?: number };
        const newExp = typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined;
        if (newExp) {
          (socket.data as any).tokenExp = newExp;
          socketService.updateTokenExpiration(socket.id, newExp);
          logger.info(`[Socket] Token refreshed for socketId=${socket.id}`);
        }
      } catch (err) {
        logger.warn(`Token refresh verification failed for socket ${socket.id}: ${(err as Error).message}`);
        socket.emit('auth_expired');
        socket.disconnect(true);
      }
    });

    // ── pong handler ────────────────────────────────────────────────────────
    socket.on('pong', (payload: PongPayload) => {
      socketService.handlePong(socket, payload);
    });

    // ── room join tracking ───────────────────────────────────────────────────
    socket.on('join_room', (room: string) => {
      socket.join(room);
      socketService.trackRoomJoin(socket.id, room);
      logger.info(`[Socket] id=${socket.id} joined room="${room}"`);
    });

    // ── room leave tracking ──────────────────────────────────────────────────
    socket.on('leave_room', (room: string) => {
      socket.leave(room);
      socketService.trackRoomLeave(socket.id, room);
      logger.info(`[Socket] id=${socket.id} left room="${room}"`);
    });

    // ── disconnect handler ───────────────────────────────────────────────────
    socket.on('disconnect', (reason: string) => {
      socketService.handleDisconnect(socket, reason);
    });

    // ── error handler ────────────────────────────────────────────────────────
    socket.on('error', (err: Error) => {
      logger.error(`[Socket] Error on id=${socket.id}: ${err.message}`, { stack: err.stack });
    });
  });

  // ─── Application-level health checks ──────────────────────────────────────
  socketService.startHealthChecks(io);

  logger.info('[Socket] Socket.IO server initialised and health-check loop started');

  return io;
}

/**
 * Gracefully shut down the Socket.IO server:
 *   - Stop the health-check loop.
 *   - Close all client connections.
 *   - Close the Socket.IO server itself.
 *
 * @param io - The Socket.IO server to shut down.
 */
export async function shutdownSocketServer(io: TypedServer): Promise<void> {
  socketService.stopHealthChecks();

  return new Promise((resolve, reject) => {
    io.close((err) => {
      if (err) {
        logger.error('[Socket] Error during shutdown:', err);
        return reject(err);
      }
      logger.info('[Socket] Socket.IO server shut down cleanly');
      resolve();
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract an authenticated user ID from the socket handshake.
 *
 * Clients should pass their JWT in the `auth` object:
 *   `socket = io(url, { auth: { token: 'Bearer <jwt>' } })`
 *
 * This is intentionally lightweight — full JWT verification should be
 * done in a dedicated auth middleware if required.
 *
 * @param socket - The connecting socket.
 * @returns        The userId string, or undefined if absent.
 */
function extractAuthInfo(socket: TypedSocket): { userId?: string; tokenExp?: number } {
  const auth = socket.handshake.auth as Record<string, unknown>;
  const token = typeof auth?.token === 'string' ? auth.token : undefined;

  if (!token) {
    return {};
  }

  try {
    const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET as string) as { userId?: string; exp?: number };
    return {
      userId: typeof decoded.userId === 'string' ? decoded.userId : undefined,
      tokenExp: typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined,
    };
  } catch (err) {
    logger.warn(`JWT verification failed for socket ${socket.id}: ${(err as Error).message}`);
    return {};
  }
}
