import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null; // stop hammering in dev if offline
        return Math.min(times * 100, 2000);
      },
    });

    redisClient.on('error', (err) => {
      logger.warn(`Redis connection event: ${err.message}`);
    });
  }
  return redisClient;
}

export async function checkRedisHealth(): Promise<{ status: 'ok' | 'error'; message: string; latency_ms?: number }> {
  const start = Date.now();
  try {
    const client = getRedisClient();
    if (client.status !== 'ready') {
      await client.connect();
    }
    const pong = await client.ping();
    const latency_ms = Date.now() - start;
    if (pong === 'PONG') {
      return {
        status: 'ok',
        message: 'Redis connection verified',
        latency_ms,
      };
    }
    return {
      status: 'error',
      message: `Unexpected Redis ping response: ${pong}`,
    };
  } catch (error: any) {
    return {
      status: 'error',
      message: error?.message || 'Failed to connect to Redis',
    };
  }
}
