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
  REDIS_URL: string;
  REDIS_LOCK_TTL_MS: number;
  REDIS_LOCK_RETRY_COUNT: number;
  REDIS_LOCK_RETRY_DELAY_MS: number;
  PROFILE_PICTURE_MAX_SIZE_MB?: string;
  PROFILE_PICTURE_WIDTH?: string;
  PROFILE_PICTURE_HEIGHT?: string;
  PROFILE_PICTURE_QUALITY?: string;

  // ── Soroban RPC retry config ────────────────────────────────────────────────
  /** Maximum attempts (including the first) for generic RPC retries. Default: 3 */
  SOROBAN_RPC_MAX_RETRIES: number;
  /** Base delay (ms) for RPC exponential backoff. Default: 250 */
  SOROBAN_RPC_RETRY_BASE_MS: number;
  /** Maximum delay (ms) cap for RPC exponential backoff. Default: 8000 */
  SOROBAN_RPC_RETRY_MAX_MS: number;
  /** Maximum attempts to retry a transaction that fails with tx_bad_seq. Default: 3 */
  STELLAR_BAD_SEQ_MAX_RETRIES: number;
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
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_LOCK_TTL_MS: z.coerce.number().int().min(1000).default(10000),
  REDIS_LOCK_RETRY_COUNT: z.coerce.number().int().min(0).default(3),
  REDIS_LOCK_RETRY_DELAY_MS: z.coerce.number().int().min(50).default(200),
  PROFILE_PICTURE_MAX_SIZE_MB: z.string().optional(),
  PROFILE_PICTURE_WIDTH: z.string().optional(),
  PROFILE_PICTURE_HEIGHT: z.string().optional(),
  PROFILE_PICTURE_QUALITY: z.string().optional(),

  // ── Soroban RPC retry config ────────────────────────────────────────────────
  SOROBAN_RPC_MAX_RETRIES: z.coerce.number().int().min(1).max(20).default(3),
  SOROBAN_RPC_RETRY_BASE_MS: z.coerce.number().int().min(50).default(250),
  SOROBAN_RPC_RETRY_MAX_MS: z.coerce.number().int().min(500).default(8000),
  STELLAR_BAD_SEQ_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(3),
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
