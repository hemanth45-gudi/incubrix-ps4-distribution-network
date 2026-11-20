import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.DATABASE_URL,
    },
  },
  log: config.SIMULATION_MODE ? [] : (process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']),
});

export async function checkDatabaseHealth(): Promise<{ status: 'ok' | 'error'; message: string; latency_ms?: number }> {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRawUnsafe('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database probe timeout')), 800)),
    ]);
    const latency_ms = Date.now() - start;
    return {
      status: 'ok',
      message: 'PostgreSQL connection verified',
      latency_ms,
    };
  } catch (error: any) {
    if (config.SIMULATION_MODE) {
      return {
        status: 'ok',
        message: 'In-memory database active (Simulation Mode)',
      };
    }
    return {
      status: 'error',
      message: error?.message || 'Failed to connect to PostgreSQL database',
    };
  }
}
