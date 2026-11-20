import { describe, it, expect, beforeEach } from 'vitest';
import { executeWithRetry, resetCircuitBreaker } from '../services/retryService.js';
import { ConnectorError } from '@incubrix/connectors';

describe('Safe Retries & Circuit Breaker Tests', () => {
  beforeEach(() => {
    resetCircuitBreaker();
  });

  it('retries on retryable errors and succeeds when transient error resolves', async () => {
    let attempts = 0;
    const result = await executeWithRetry(
      'target-retryable',
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new ConnectorError('PLATFORM_RATE_LIMIT', 'Rate limited, retry', true, 429);
        }
        return 'success_data';
      },
      { maxRetries: 3, initialDelayMs: 10, jitter: false }
    );

    expect(result).toBe('success_data');
    expect(attempts).toBe(2);
  });

  it('immediately throws on non-retryable error without retrying', async () => {
    let attempts = 0;
    await expect(
      executeWithRetry(
        'target-non-retryable',
        async () => {
          attempts++;
          throw new ConnectorError('DEST_SPEC_VIOLATION', 'Title exceeded limits', false, 422);
        },
        { maxRetries: 3, initialDelayMs: 10 }
      )
    ).rejects.toThrow(/Title exceeded limits/);

    expect(attempts).toBe(1);
  });

  it('trips circuit breaker after 5 consecutive failures', async () => {
    const targetKey = 'failing-platform';
    for (let i = 0; i < 5; i++) {
      await expect(
        executeWithRetry(
          targetKey,
          async () => {
            throw new ConnectorError('PLATFORM_UNAVAILABLE', 'Server down', true, 503);
          },
          { maxRetries: 1, initialDelayMs: 5 }
        )
      ).rejects.toThrow();
    }

    // 6th call must immediately be blocked by circuit breaker
    await expect(
      executeWithRetry(
        targetKey,
        async () => {
          return 'should_never_reach';
        },
        { maxRetries: 1 }
      )
    ).rejects.toThrow(/Platform circuit breaker active/);
  });
});
