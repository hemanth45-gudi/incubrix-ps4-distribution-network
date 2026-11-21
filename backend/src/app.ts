import express from 'express';
import cors from 'cors';
import { initializeConnectors } from '@incubrix/connectors';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { connectorRouter } from './routes/connector.js';
import { apiV1Router } from './routes/api.js';
import { mockRouter } from './mocks/platformMocks.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // Initialize all connector manifests and register connectors
  try {
    initializeConnectors();
  } catch (err: any) {
    logger.warn(`Connector initialization warning: ${err.message}`);
  }

  // Basic security and parsing
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ type: ['text/plain', 'text/csv'], limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Correlation ID middleware
  app.use(correlationIdMiddleware);

  // Request logger
  app.use((req, res, next) => {
    logger.info(`HTTP ${req.method} ${req.url}`, {
      correlation_id: req.correlationId,
      details: {
        method: req.method,
        path: req.path,
        ip: req.ip,
      },
    });
    next();
  });

  // Health and Readiness probes
  app.use(healthRouter);

  // Mock platform servers (Discourse, Lemmy, Dev.to, Ghost, Webhook)
  app.use(mockRouter);

  // Exact Connector HTTP contract routes (/connector/v1/:connector_key/...)
  app.use(connectorRouter);

  // Full Management API routes (/api/v1/...)
  app.use(apiV1Router);

  // Management API placeholder routes for Phase 1
  app.get('/api/v1/info', (req, res) => {
    res.json({
      name: 'IncuBrix Long-Tail Destination Network API',
      version: '1.0.0',
      status: 'operational',
      correlation_id: req.correlationId,
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.path} not found`,
        retryable: false,
      },
    });
  });

  // Central error handler
  app.use(errorHandlerMiddleware);

  return app;
}
