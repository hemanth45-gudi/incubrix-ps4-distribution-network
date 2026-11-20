export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  job_id?: string;
  correlation_id?: string;
  connector_key?: string;
  destination_id?: string;
  details?: Record<string, any>;
  [key: string]: any;
}

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'api_key',
  'authorization',
  'cookie',
  'admin_api_key',
  'minio_secret_key'
];

export function maskSecrets(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(maskSecrets);
  }
  if (typeof obj === 'object') {
    const masked: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
        masked[key] = '***REDACTED***';
      } else if (typeof val === 'object' && val !== null) {
        masked[key] = maskSecrets(val);
      } else {
        masked[key] = val;
      }
    }
    return masked;
  }
  return obj;
}

class StructuredLogger {
  private formatLog(level: LogLevel, message: string, context?: Partial<LogEntry>): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context?.job_id ? { job_id: context.job_id } : {}),
      ...(context?.correlation_id ? { correlation_id: context.correlation_id } : {}),
      ...(context?.connector_key ? { connector_key: context.connector_key } : {}),
      ...(context?.destination_id ? { destination_id: context.destination_id } : {}),
      ...(context?.details ? { details: maskSecrets(context.details) } : {})
    };

    return JSON.stringify(entry);
  }

  debug(message: string, context?: Partial<LogEntry>) {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.debug(this.formatLog('debug', message, context));
    }
  }

  info(message: string, context?: Partial<LogEntry>) {
    console.log(this.formatLog('info', message, context));
  }

  warn(message: string, context?: Partial<LogEntry>) {
    console.warn(this.formatLog('warn', message, context));
  }

  error(message: string, context?: Partial<LogEntry>) {
    console.error(this.formatLog('error', message, context));
  }
}

export const logger = new StructuredLogger();
