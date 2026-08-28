import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  BCRYPT_ROUNDS: number;
  LOG_LEVEL: string;
  CORS_ORIGIN: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  DISPUTE_NOTIFICATION_WEBHOOK_URL: string;
  UPLOAD_STORAGE_DRIVER: string;
  UPLOAD_LOCAL_DIR: string;
  AWS_S3_BUCKET?: string;

  // ── Circuit breaker — Google Maps Directions API ────────────────────────────
  /** % of recent calls that must fail before the circuit opens. Default: 50 */
  CB_GOOGLE_MAPS_ERROR_THRESHOLD_PERCENTAGE: number;
  /** Rolling window size (ms) used to compute the error rate. Default: 30000 */
  CB_GOOGLE_MAPS_ROLLING_WINDOW_MS: number;
  /** How long (ms) the circuit stays open before trying a test call. Default: 60000 */
  CB_GOOGLE_MAPS_RESET_TIMEOUT_MS: number;
  /** Minimum calls in the window before the breaker can open. Default: 5 */
  CB_GOOGLE_MAPS_VOLUME_THRESHOLD: number;
  /** Per-call timeout (ms) before counting a call as a failure. Default: 10000 */
  CB_GOOGLE_MAPS_TIMEOUT_MS: number;

  // ── Circuit breaker — Stellar / Soroban RPC ─────────────────────────────────
  /** % of recent calls that must fail before the circuit opens. Default: 50 */
  CB_SOROBAN_ERROR_THRESHOLD_PERCENTAGE: number;
  /** Rolling window size (ms). Default: 30000 */
  CB_SOROBAN_ROLLING_WINDOW_MS: number;
  /** How long (ms) the circuit stays open before attempting recovery. Default: 60000 */
  CB_SOROBAN_RESET_TIMEOUT_MS: number;
  /** Minimum calls in the window before the breaker can open. Default: 3 */
  CB_SOROBAN_VOLUME_THRESHOLD: number;
  /** Per-call timeout (ms). Default: 15000 */
  CB_SOROBAN_TIMEOUT_MS: number;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/swiftchain'),
  JWT_SECRET: z.string().min(16).default('change_me_in_prod_change_me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(31).default(10),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  DISPUTE_NOTIFICATION_WEBHOOK_URL: z.string().default(''),
  UPLOAD_STORAGE_DRIVER: z.string().default('local'),
  UPLOAD_LOCAL_DIR: z.string().default('uploads'),
  AWS_S3_BUCKET: z.string().optional(),

  // ── Circuit breaker — Google Maps ───────────────────────────────────────────
  CB_GOOGLE_MAPS_ERROR_THRESHOLD_PERCENTAGE: z.coerce.number().int().min(1).max(100).default(50),
  CB_GOOGLE_MAPS_ROLLING_WINDOW_MS: z.coerce.number().int().min(1000).default(30_000),
  CB_GOOGLE_MAPS_RESET_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  CB_GOOGLE_MAPS_VOLUME_THRESHOLD: z.coerce.number().int().min(1).default(5),
  CB_GOOGLE_MAPS_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),

  // ── Circuit breaker — Soroban RPC ───────────────────────────────────────────
  CB_SOROBAN_ERROR_THRESHOLD_PERCENTAGE: z.coerce.number().int().min(1).max(100).default(50),
  CB_SOROBAN_ROLLING_WINDOW_MS: z.coerce.number().int().min(1000).default(30_000),
  CB_SOROBAN_RESET_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  CB_SOROBAN_VOLUME_THRESHOLD: z.coerce.number().int().min(1).default(3),
  CB_SOROBAN_TIMEOUT_MS: z.coerce.number().int().min(100).default(15_000),
});

let env: EnvConfig;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
  } else {
    console.error('❌ Failed to parse environment variables:', error);
  }
  process.exit(1);
}

if (env.UPLOAD_STORAGE_DRIVER === 's3' && !env.AWS_S3_BUCKET) {
  console.error('❌ AWS_S3_BUCKET is required when UPLOAD_STORAGE_DRIVER=s3');
  process.exit(1);
}

export default env;
