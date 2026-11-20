import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Load .env from backend folder or root folder
const rootEnvPath = path.resolve(process.cwd(), '../.env');
const currentEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(currentEnvPath)) {
  dotenv.config({ path: currentEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_PREFIX: z.string().default('/api/v1'),
  SIMULATION_MODE: z.string().transform((v) => v === 'true').default('true'),

  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/incubrix_network?schema=public'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.string().transform((v) => v === 'true').default('false'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET: z.string().default('incubrix-artifacts'),

  WEBHOOK_DEFAULT_SECRET: z.string().default('mock-webhook-secret-32-bytes-long!'),
  ADMIN_API_KEY: z.string().default('incubrix-admin-dev-key'),

  MOCK_DISCOURSE_URL: z.string().default('http://localhost:4001'),
  MOCK_LEMMY_URL: z.string().default('http://localhost:4002'),
  MOCK_DEVTO_URL: z.string().default('http://localhost:4003'),
  MOCK_GHOST_URL: z.string().default('http://localhost:4004'),
  MOCK_WEBHOOK_RECEIVER_URL: z.string().default('http://localhost:4005'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config = parsedEnv.data;
