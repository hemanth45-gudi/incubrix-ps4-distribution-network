import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function checkDatabaseHealth(): Promise<{ status: 'ok' | 'error'; message: string; latency_ms?: number }> {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latency_ms = Date.now() - start;
    return {
      status: 'ok',
      message: 'PostgreSQL connection verified',
      latency_ms,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error?.message || 'Failed to connect to PostgreSQL database',
    };
  }
}
