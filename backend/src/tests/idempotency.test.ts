import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { idempotencyService } from '../services/idempotency.js';

describe('Idempotency & Safe Retry Tests', () => {
  const app = createApp();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    idempotencyService.clear();
  });

  const getBasePayload = () => ({
    rendition: {
      title: 'Idempotency Post Test',
      body: 'Valid unique body content for publication',
    },
    destination: {
      id: 'dest-disc-1',
      name: 'Forum Alpha',
      url: `${baseUrl}/mock/discourse`,
      platform_key: 'discourse',
      connector_key: 'discourse',
    },
    connection: {
      base_url: `${baseUrl}/mock/discourse`,
      api_key: 'valid_key_123',
      username: 'test_admin',
    },
  });

  it('requires Idempotency-Key header on publish endpoint', async () => {
    const res = await request(app)
      .post('/connector/v1/discourse/publish')
      .send(getBasePayload());

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DEST_SPEC_VIOLATION');
    expect(res.body.error.message).toMatch(/Idempotency-Key/);
  });

  it('returns identical result for repeated request with same key and payload (zero duplicates)', async () => {
    const key = 'idem-unique-key-1001';
    const payload = getBasePayload();

    // First publication
    const res1 = await request(app)
      .post('/connector/v1/discourse/publish')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.platform_post_id).toBeDefined();
    const originalPostId = res1.body.platform_post_id;

    // Second publication with identical key and payload (e.g. client timeout retry)
    const res2 = await request(app)
      .post('/connector/v1/discourse/publish')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.platform_post_id).toBe(originalPostId);
  });

  it('returns 409 Conflict when same key is used with a different request payload', async () => {
    const key = 'idem-unique-key-2002';
    const payload = getBasePayload();

    // First request
    const res1 = await request(app)
      .post('/connector/v1/discourse/publish')
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res1.status).toBe(200);

    // Second request with conflicting payload (different title)
    const modifiedPayload = {
      ...payload,
      rendition: {
        ...payload.rendition,
        title: 'Tampered Changed Title',
      },
    };

    const res2 = await request(app)
      .post('/connector/v1/discourse/publish')
      .set('Idempotency-Key', key)
      .send(modifiedPayload);

    expect(res2.status).toBe(409);
    expect(res2.body.error).toBeDefined();
    expect(res2.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(res2.body.error.retryable).toBe(false);
  });
});
