import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`🚀 IncuBrix Destination Network service started on port ${config.PORT}`, {
    details: {
      port: config.PORT,
      env: config.NODE_ENV,
      simulation_mode: config.SIMULATION_MODE,
    },
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
  });
});
