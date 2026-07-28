/**
 * Data shapes shared across the Socket.IO load harness. The harness targets
 * the real Socket.IO gateway defined in `src/sockets/`, so these types
 * mirror the wire payloads that server already accepts/emits — nothing here
 * substitutes for the real server contract.
 */

export interface SeededDriver {
  id: string;
  email: string;
}

export interface SeededDelivery {
  id: string;
}

export interface LoadTestFixtures {
  password: string;
  drivers: SeededDriver[];
  customers: SeededDriver[];
  deliveries: SeededDelivery[];
}

export interface DriverLocationUpdatePayload {
  deliveryId: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface LocationUpdateAck {
  success: boolean;
  error?: string;
}

export interface ConnectionResult {
  connectionIndex: number;
  connected: boolean;
  authenticated: boolean;
  updatesSent: number;
  acksReceived: number;
  acksFailed: number;
  errors: string[];
  connectLatencyMs: number | null;
}

export interface LoadTestSummary {
  requestedConnections: number;
  connected: number;
  failedToConnect: number;
  totalUpdatesSent: number;
  totalAcksReceived: number;
  totalAcksFailed: number;
  avgConnectLatencyMs: number;
  durationSec: number;
}
