import { io, Socket } from 'socket.io-client';
import {
  ConnectionResult,
  DriverLocationUpdatePayload,
  LocationUpdateAck,
  SeededDelivery,
  SeededDriver,
} from '../models/types';

export interface SimulatedConnectionOptions {
  baseUrl: string;
  namespace: string;
  driver: SeededDriver;
  token: string;
  delivery: SeededDelivery;
  connectionIndex: number;
  durationMs: number;
  emitIntervalMs: number;
}

/**
 * Service layer: owns the lifecycle of one simulated driver WebSocket
 * connection against the real Socket.IO gateway (`src/sockets/connectionHandler.ts`).
 *
 * Connects using the same handshake contract the production gateway expects
 * (`auth.userId`, mirrored by `auth.token` from the real login response for
 * forward compatibility once the gateway adds JWT verification on this
 * namespace), joins the delivery's room, and periodically emits
 * `driver_location_update` — exactly what the mobile driver app would send.
 */
export class SimulatedDriverConnection {
  private socket: Socket | null = null;

  constructor(private readonly options: SimulatedConnectionOptions) {}

  public async run(): Promise<ConnectionResult> {
    const {
      baseUrl,
      namespace,
      driver,
      token,
      delivery,
      connectionIndex,
      durationMs,
      emitIntervalMs,
    } = this.options;

    const result: ConnectionResult = {
      connectionIndex,
      connected: false,
      authenticated: false,
      updatesSent: 0,
      acksReceived: 0,
      acksFailed: 0,
      errors: [],
      connectLatencyMs: null,
    };

    const connectStartedAt = Date.now();

    return new Promise<ConnectionResult>((resolve) => {
      const socket: Socket = io(`${baseUrl}${namespace}`, {
        transports: ['websocket'],
        auth: { userId: driver.id, token },
        reconnection: false,
        timeout: 10_000,
      });
      this.socket = socket;

      let updateInterval: ReturnType<typeof setInterval> | null = null;
      let stopTimeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (updateInterval) clearInterval(updateInterval);
        if (stopTimeout) clearTimeout(stopTimeout);
        socket.removeAllListeners();
        socket.disconnect();
      };

      socket.on('connect', () => {
        result.connected = true;
        result.authenticated = true;
        result.connectLatencyMs = Date.now() - connectStartedAt;

        socket.emit('join_room', `delivery:${delivery.id}`);

        updateInterval = setInterval(() => {
          const payload: DriverLocationUpdatePayload = {
            deliveryId: delivery.id,
            lat: 40.7 + Math.random() * 0.05,
            lng: -74.0 + Math.random() * 0.05,
            timestamp: Date.now(),
          };
          socket.emit('driver_location_update', payload);
          result.updatesSent += 1;
        }, emitIntervalMs);

        stopTimeout = setTimeout(() => {
          cleanup();
          resolve(result);
        }, durationMs);
      });

      socket.on('location_update_ack', (ack: LocationUpdateAck) => {
        if (ack.success) {
          result.acksReceived += 1;
        } else {
          result.acksFailed += 1;
          result.errors.push(ack.error ?? 'Unknown ack error');
        }
      });

      socket.on('connect_error', (error: Error) => {
        result.errors.push(`connect_error: ${error.message}`);
        cleanup();
        resolve(result);
      });

      socket.on('error', (error: Error) => {
        result.errors.push(`error: ${error.message ?? String(error)}`);
      });
    });
  }

  public disconnect(): void {
    this.socket?.disconnect();
  }
}

export default SimulatedDriverConnection;
