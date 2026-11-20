import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { maskSecrets } from './utils/logger.js';

describe('Health & Readiness Endpoints', () => {
  const app = createApp();

  it('GET /health should return 200 with service metadata', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('incubrix-destination-network');
    expect(res.body.version).toBe('1.0.0');
    expect(typeof res.body.uptime_seconds).toBe('number');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('GET /ready should return structured dependency checks', async () => {
    const res = await request(app).get('/ready');
    // Depending on whether local Postgres/Redis are online, status is 200 or 503
    expect([200, 503]).toContain(res.status);
    expect(res.body.checks).toBeDefined();
    expect(res.body.checks.database).toBeDefined();
    expect(res.body.checks.redis).toBeDefined();
    expect(res.body.checks.storage).toBeDefined();
  });

  it('Should pass through custom X-Correlation-Id header', async () => {
    const customId = 'test-correlation-12345';
    const res = await request(app)
      .get('/health')
      .set('X-Correlation-Id', customId);

    expect(res.headers['x-correlation-id']).toBe(customId);
  });

  it('404 routes should return standardized IncuBrix error schema', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.retryable).toBe(false);
  });
});

describe('Secret Masking in Logging', () => {
  it('masks sensitive keys including passwords, tokens, and api keys', () => {
    const payload = {
      username: 'incubrix_user',
      api_key: 'super-secret-token-123',
      nested: {
        password: 'password123',
        webhook_secret: 'whsec_abcdef',
        normal_field: 'public_value',
      },
    };

    const masked = maskSecrets(payload);
    expect(masked.username).toBe('incubrix_user');
    expect(masked.api_key).toBe('***REDACTED***');
    expect(masked.nested.password).toBe('***REDACTED***');
    expect(masked.nested.webhook_secret).toBe('***REDACTED***');
    expect(masked.nested.normal_field).toBe('public_value');
  });
});
