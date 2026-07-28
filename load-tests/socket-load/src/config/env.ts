import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  LOAD_TEST_BASE_URL: z.string().default('http://localhost:3000'),
  LOAD_TEST_API_VERSION: z.string().default('v1'),
  SOCKET_LOAD_CONNECTIONS: z.coerce.number().int().min(1).default(100),
  SOCKET_LOAD_DURATION_SEC: z.coerce.number().int().min(1).default(60),
  SOCKET_LOAD_EMIT_INTERVAL_MS: z.coerce.number().int().min(50).default(2000),
  SOCKET_LOAD_RAMP_UP_MS: z.coerce.number().int().min(0).default(5000),
});

export interface SocketLoadEnv {
  baseUrl: string;
  namespace: string;
  connections: number;
  durationSec: number;
  emitIntervalMs: number;
  rampUpMs: number;
}

function loadEnv(): SocketLoadEnv {
  const parsed = envSchema.parse(process.env);

  return {
    baseUrl: parsed.LOAD_TEST_BASE_URL,
    namespace: `/api/${parsed.LOAD_TEST_API_VERSION}/realtime`,
    connections: parsed.SOCKET_LOAD_CONNECTIONS,
    durationSec: parsed.SOCKET_LOAD_DURATION_SEC,
    emitIntervalMs: parsed.SOCKET_LOAD_EMIT_INTERVAL_MS,
    rampUpMs: parsed.SOCKET_LOAD_RAMP_UP_MS,
  };
}

export default loadEnv;
