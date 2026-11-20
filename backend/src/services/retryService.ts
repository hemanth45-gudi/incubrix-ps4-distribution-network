import { isRetryable, ConnectorError } from '@incubrix/connectors';
import { logger } from '../utils/logger.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
}

const consecutiveFailures = new Map<string, number>();

export async function executeWithRetry<T>(
  targetKey: string,
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 4000;
  const jitter = options.jitter ?? true;

  // Circuit breaker: stop calling after 5 consecutive failures
  const failureCount = consecutiveFailures.get(targetKey) || 0;
  if (failureCount >= 5) {
    throw new ConnectorError(
      'PLATFORM_UNAVAILABLE',
      `Platform circuit breaker active: destination/connector '${targetKey}' experienced ${failureCount} consecutive failures. Backing off until reset.`,
      true,
      503,
      { consecutive_failures: failureCount }
    );
  }

  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation(attempt);
      // Reset failure streak on success
      consecutiveFailures.delete(targetKey);
      return result;
    } catch (err: any) {
      lastError = err;
      const errorCode = err.code || 'PLATFORM_UNAVAILABLE';
      const retryable = err.retryable !== undefined ? err.retryable : isRetryable(errorCode);

      if (!retryable || attempt === maxRetries) {
        consecutiveFailures.set(targetKey, (consecutiveFailures.get(targetKey) || 0) + 1);
        throw err;
      }

      // Calculate exponential backoff delay with jitter
      let delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      if (jitter) {
        delay = Math.floor(delay * (0.75 + Math.random() * 0.5));
      }

      // Check if error contained specific Retry-After header
      if (err.details?.retryAfter) {
        delay = Math.max(delay, parseInt(err.details.retryAfter, 10) * 1000);
      }

      logger.warn(`Retryable error on ${targetKey} (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  consecutiveFailures.set(targetKey, (consecutiveFailures.get(targetKey) || 0) + 1);
  throw lastError;
}

export function resetCircuitBreaker(targetKey?: string): void {
  if (targetKey) {
    consecutiveFailures.delete(targetKey);
  } else {
    consecutiveFailures.clear();
  }
}
