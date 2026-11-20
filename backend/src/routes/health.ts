import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database/client.js';
import { checkRedisHealth } from '../jobs/queue.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export const healthRouter = Router();

const startTime = Date.now();

/**
 * Liveness Probe: Quick check if HTTP server is running
 */
healthRouter.get('/health', (req: Request, res: Response) => {
  const uptime_seconds = Math.floor((Date.now() - startTime) / 1000);
  res.status(200).json({
    status: 'ok',
    service: 'incubrix-destination-network',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime_seconds,
    simulation_mode: config.SIMULATION_MODE,
  });
});

/**
 * Readiness Probe: Checks backing dependencies (PostgreSQL, Redis)
 */
healthRouter.get('/ready', async (req: Request, res: Response) => {
  const [dbCheck, redisCheck] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const isReady = dbCheck.status === 'ok' && redisCheck.status === 'ok';
  const statusCode = isReady ? 200 : 503;

  const result = {
    status: isReady ? 'ready' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      redis: redisCheck,
      storage: {
        status: 'ok',
        message: config.SIMULATION_MODE
          ? 'Local artifact storage active (Simulation Mode)'
          : 'Storage subsystem configured',
      },
    },
  };

  if (!isReady) {
    logger.warn('Readiness check failed', {
      correlation_id: req.correlationId,
      details: result.checks,
    });
  }

  res.status(statusCode).json(result);
});
