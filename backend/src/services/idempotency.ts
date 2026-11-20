import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler.js';

export interface IdempotencyEntry {
  key: string;
  payloadHash: string;
  response: any;
  createdAt: number;
}

function stableStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

export class IdempotencyService {
  private cache = new Map<string, IdempotencyEntry>();

  /**
   * Generates a deterministic SHA-256 hash of a JSON payload
   */
  public hashPayload(payload: any): string {
    const serialized = stableStringify(payload);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Checks if an idempotency key exists.
   * If identical payload: returns cached response.
   * If different payload: throws 409 Conflict error.
   * If new: returns null.
   */
  public check(key: string, payload: any): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const currentHash = this.hashPayload(payload);
    if (entry.payloadHash !== currentHash) {
      throw new AppError(
        'IDEMPOTENCY_CONFLICT',
        `Idempotency-Key '${key}' was previously used with a different request payload`,
        false,
        409,
        {
          key,
          original_hash: entry.payloadHash,
          current_hash: currentHash,
        }
      );
    }

    return entry.response;
  }

  /**
   * Stores response for a given idempotency key
   */
  public store(key: string, payload: any, response: any): void {
    const payloadHash = this.hashPayload(payload);
    this.cache.set(key, {
      key,
      payloadHash,
      response,
      createdAt: Date.now(),
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const idempotencyService = new IdempotencyService();
