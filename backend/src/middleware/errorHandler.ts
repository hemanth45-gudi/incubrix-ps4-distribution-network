import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  public code: string;
  public retryable: boolean;
  public details: Record<string, any>;
  public statusCode: number;

  constructor(
    code: string,
    message: string,
    retryable: boolean = false,
    statusCode: number = 400,
    details: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function errorHandlerMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
  const correlationId = req.correlationId;

  if (err instanceof AppError || err?.name === 'ConnectorError' || err?.code) {
    const statusCode = err.statusCode || (err.status && typeof err.status === 'number' ? err.status : 400);
    logger.warn(`Operational Error [${err.code}]: ${err.message}`, {
      correlation_id: correlationId,
      details: err.details,
    });

    return res.status(statusCode).json({
      error: {
        code: err.code || 'UNKNOWN_ERROR',
        message: err.message || 'Operation failed',
        retryable: typeof err.retryable === 'boolean' ? err.retryable : false,
        details: err.details || {},
      },
    });
  }

  // Handle generic or unexpected errors
  logger.error(`Unhandled error: ${err?.message || 'Internal Server Error'}`, {
    correlation_id: correlationId,
    details: { stack: err?.stack },
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err?.message || 'An unexpected internal server error occurred',
      retryable: true,
      details: {},
    },
  });
}
