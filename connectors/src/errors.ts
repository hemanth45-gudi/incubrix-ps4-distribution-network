import { StandardErrorCode, StandardApiError } from './types.js';

export const RETRYABLE_ERROR_CODES: Set<StandardErrorCode> = new Set([
  'PLATFORM_RATE_LIMIT',
  'PLATFORM_UNAVAILABLE',
  'PLATFORM_QUOTA_EXHAUSTED',
  'DEST_RULE_FREQUENCY_CAP',
]);

export function isRetryable(code: StandardErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}

export class ConnectorError extends Error {
  public code: StandardErrorCode | string;
  public retryable: boolean;
  public details: Record<string, any>;
  public statusCode: number;

  constructor(
    code: StandardErrorCode | string,
    message: string,
    retryable?: boolean,
    statusCode: number = 400,
    details: Record<string, any> = {}
  ) {
    super(message);
    this.name = 'ConnectorError';
    this.code = code;
    this.retryable = retryable !== undefined ? retryable : isRetryable(code as StandardErrorCode);
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON(): StandardApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        details: this.details,
      },
    };
  }
}

export function mapPlatformStatusToErrorCode(
  status: number,
  manifestMap?: Record<string, StandardErrorCode>
): StandardErrorCode {
  const statusStr = String(status);
  if (manifestMap && manifestMap[statusStr]) {
    return manifestMap[statusStr];
  }

  switch (status) {
    case 401:
    case 403:
      return 'CONNECTION_AUTH_EXPIRED';
    case 422:
      return 'PLATFORM_CONTENT_REJECTED';
    case 429:
      return 'PLATFORM_RATE_LIMIT';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'PLATFORM_UNAVAILABLE';
    default:
      return status >= 500 ? 'PLATFORM_UNAVAILABLE' : 'DEST_SPEC_VIOLATION';
  }
}
