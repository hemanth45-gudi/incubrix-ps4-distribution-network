import { describe, it, expect } from 'vitest';
import {
  ConnectorError,
  isRetryable,
  mapPlatformStatusToErrorCode,
  StandardErrorCode,
} from '@incubrix/connectors';

describe('Shared Error Codes & Mapper Tests', () => {
  const allEightCodes: StandardErrorCode[] = [
    'DEST_SPEC_VIOLATION',
    'DEST_RULE_FREQUENCY_CAP',
    'CONNECTION_AUTH_EXPIRED',
    'PLATFORM_RATE_LIMIT',
    'PLATFORM_QUOTA_EXHAUSTED',
    'PLATFORM_CONTENT_REJECTED',
    'PLATFORM_UNAVAILABLE',
    'CONNECTOR_DISABLED',
  ];

  it('correctly categorizes retryable vs non-retryable error codes', () => {
    expect(isRetryable('PLATFORM_RATE_LIMIT')).toBe(true);
    expect(isRetryable('PLATFORM_UNAVAILABLE')).toBe(true);
    expect(isRetryable('PLATFORM_QUOTA_EXHAUSTED')).toBe(true);
    expect(isRetryable('DEST_RULE_FREQUENCY_CAP')).toBe(true);

    expect(isRetryable('DEST_SPEC_VIOLATION')).toBe(false);
    expect(isRetryable('CONNECTION_AUTH_EXPIRED')).toBe(false);
    expect(isRetryable('PLATFORM_CONTENT_REJECTED')).toBe(false);
    expect(isRetryable('CONNECTOR_DISABLED')).toBe(false);
  });

  it('formats standardized error payload conforming to IncuBrix spec', () => {
    const err = new ConnectorError('DEST_SPEC_VIOLATION', 'Title exceeded limit', false, 422, {
      field: 'title',
      max: 255,
    });

    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        code: 'DEST_SPEC_VIOLATION',
        message: 'Title exceeded limit',
        retryable: false,
        details: { field: 'title', max: 255 },
      },
    });
  });

  it('maps standard platform HTTP status codes', () => {
    expect(mapPlatformStatusToErrorCode(401)).toBe('CONNECTION_AUTH_EXPIRED');
    expect(mapPlatformStatusToErrorCode(403)).toBe('CONNECTION_AUTH_EXPIRED');
    expect(mapPlatformStatusToErrorCode(422)).toBe('PLATFORM_CONTENT_REJECTED');
    expect(mapPlatformStatusToErrorCode(429)).toBe('PLATFORM_RATE_LIMIT');
    expect(mapPlatformStatusToErrorCode(500)).toBe('PLATFORM_UNAVAILABLE');
    expect(mapPlatformStatusToErrorCode(503)).toBe('PLATFORM_UNAVAILABLE');
  });

  it('respects connector custom manifest error_map overrides', () => {
    const customMap: Record<string, StandardErrorCode> = {
      '400': 'PLATFORM_CONTENT_REJECTED',
      '404': 'DEST_SPEC_VIOLATION',
    };

    expect(mapPlatformStatusToErrorCode(400, customMap)).toBe('PLATFORM_CONTENT_REJECTED');
    expect(mapPlatformStatusToErrorCode(404, customMap)).toBe('DEST_SPEC_VIOLATION');
  });
});
