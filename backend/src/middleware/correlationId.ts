import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.header('X-Correlation-Id') || req.header('x-correlation-id') || uuidv4()) as string;
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
