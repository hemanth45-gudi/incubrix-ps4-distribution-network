import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { dbRepository } from '../database/repository.js';
import { idempotencyService } from '../services/idempotency.js';

describe('Publishing Workflow Integration Tests (/api/v1/publish)', () => {
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
    dbRepository.clearMemory();
  });

  it('completes end-to-end publication and retrieves publication record', async () => {
    const pubPayload = {
      destination_id: 'dest-discourse-001',
      rendition: {
        title: 'End-to-End Architectural Publishing Flow',
        body: 'Valid technical content passing all community posting rules.',
        tags: ['architecture', 'api'],
      },
      connection: {
        base_url: `${baseUrl}/mock/discourse`,
        api_key: 'valid_key_workflow',
        username: 'workflow_user',
      },
    };

    const res = await request(app)
      .post('/api/v1/publish')
      .set('Idempotency-Key', 'e2e-pub-key-101')
      .send(pubPayload);

    expect(res.status).toBe(200);
    expect(res.body.publication).toBeDefined();
    expect(res.body.publication.id).toBeDefined();
    expect(res.body.publish_result.status).toBe('published');
    expect(res.body.manifest).toBeDefined();
    expect(res.body.manifest.provider.ai_assisted).toBe(false);
    expect(res.body.manifest.provider.note).toMatch(/no AI model was used/);

    const pubId = res.body.publication.id;

    // Verify GET /api/v1/publications/:id returns persisted record
    const getRes = await request(app).get(`/api/v1/publications/${pubId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('End-to-End Architectural Publishing Flow');

    // Verify post deletion via POST /api/v1/publications/:id/delete
    const delRes = await request(app)
      .post(`/api/v1/publications/${pubId}/delete`)
      .send({ connection: { base_url: `${baseUrl}/mock/discourse` } });

    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);
    expect(delRes.body.status).toBe('deleted');
  });

  it('blocks publication and logs rule decisions when rule violations occur', async () => {
    const violatingPayload = {
      destination_id: 'dest-lemmy-001', // Lemmy prohibits self-promo
      rendition: {
        title: 'Special Discount Offer',
        body: 'Click here to buy now and get 50% off right now!',
      },
    };

    const res = await request(app)
      .post('/api/v1/publish')
      .set('Idempotency-Key', 'rule-violate-key-202')
      .send(violatingPayload);

    expect(res.status).toBe(422);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('DEST_SPEC_VIOLATION');
    expect(res.body.error.message).toMatch(/Self-promotion is prohibited/);

    // Verify decision log was persisted
    const decisionsRes = await request(app).get('/api/v1/destinations/dest-lemmy-001/rules');
    expect(decisionsRes.status).toBe(200);
    expect(decisionsRes.body.recent_decisions.length).toBeGreaterThan(0);
  });
});
