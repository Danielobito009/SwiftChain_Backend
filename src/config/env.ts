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
  SOROBAN_RPC_MAX_RETRIES: number;
  SOROBAN_RPC_RETRY_BASE_MS: number;
  SOROBAN_RPC_RETRY_MAX_MS: number;
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
  SOROBAN_RPC_MAX_RETRIES: z.coerce.number().int().min(1).max(10).default(5),
  SOROBAN_RPC_RETRY_BASE_MS: z.coerce.number().int().min(1).default(250),
  SOROBAN_RPC_RETRY_MAX_MS: z.coerce.number().int().min(1).default(8000),
});

let env: EnvConfig;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    // eslint-disable-next-line no-console
    console.error('❌ Invalid environment variables:');
    error.issues.forEach((issue) => {
      // eslint-disable-next-line no-console
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
  } else {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to parse environment variables:', error);
  }
  process.exit(1);
}

export default env;
