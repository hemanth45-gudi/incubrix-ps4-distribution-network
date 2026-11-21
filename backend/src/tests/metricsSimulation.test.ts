import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { dbRepository } from '../database/repository.js';
import { generateDeterministicMetrics } from '../services/metricsService.js';

describe('Normalised Metrics in Simulation Mode (/api/v1/metrics/:id)', () => {
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
    dbRepository.clearMemory();
  });

  it('generateDeterministicMetrics returns reproducible metrics for identical ID and distinct metrics for different IDs', () => {
    const idA = 'pub-article-alpha-001';
    const idB = 'pub-article-beta-002';
    const idC = 'pub-video-gamma-003';

    const metricsA1 = generateDeterministicMetrics(idA);
    const metricsA2 = generateDeterministicMetrics(idA);
    const metricsB = generateDeterministicMetrics(idB);
    const metricsC = generateDeterministicMetrics(idC);

    // Exact consistency for same ID
    expect(metricsA1).toEqual(metricsA2);
    expect(metricsA1.views).toBeGreaterThan(0);
    expect(metricsA1.likes).toBeGreaterThan(0);

    // Distinct metrics for different publications
    expect(metricsA1.views).not.toBe(metricsB.views);
    expect(metricsB.views).not.toBe(metricsC.views);
    expect(metricsA1.likes).not.toBe(metricsB.likes);
  });

  it('returns 404 for non-existent publication ID', async () => {
    const res = await request(app).get('/api/v1/metrics/pub-non-existent-999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('generates, stores, and returns separate deterministic metrics for different publications', async () => {
    // Create two distinct publications
    const pub1 = await dbRepository.createPublication({
      id: 'pub-test-metrics-001',
      destination_id: 'dest-discourse-001',
      connector_key: 'discourse',
      title: 'First Tech Post',
      body: 'Content for first tech post.',
      status: 'published',
    });

    const pub2 = await dbRepository.createPublication({
      id: 'pub-test-metrics-002',
      destination_id: 'dest-devto-001',
      connector_key: 'devto',
      title: 'Second Tech Post',
      body: 'Content for second tech post.',
      status: 'published',
    });

    // Fetch metrics for pub1
    const res1 = await request(app).get(`/api/v1/metrics/${pub1.id}`);
    expect(res1.status).toBe(200);
    expect(res1.body.publication_id).toBe(pub1.id);
    expect(res1.body.views).toBeGreaterThan(0);
    expect(res1.body.likes).toBeGreaterThan(0);
    expect(res1.body.comments).toBeGreaterThanOrEqual(0);
    expect(res1.body.shares).toBeGreaterThanOrEqual(0);
    expect(res1.body.clicks).toBeGreaterThanOrEqual(0);

    // Fetch metrics for pub2
    const res2 = await request(app).get(`/api/v1/metrics/${pub2.id}`);
    expect(res2.status).toBe(200);
    expect(res2.body.publication_id).toBe(pub2.id);
    expect(res2.body.views).toBeGreaterThan(0);

    // Ensure metrics are DIFFERENT between pub1 and pub2
    expect(res1.body.views).not.toBe(res2.body.views);
    expect(res1.body.likes).not.toBe(res2.body.likes);
  });

  it('maintains strict consistency across repeated fetches for the same publication', async () => {
    const pub = await dbRepository.createPublication({
      id: 'pub-consistent-test-001',
      destination_id: 'dest-hashnode-001',
      connector_key: 'hashnode',
      title: 'Consistency Check Article',
      body: 'Ensuring metrics do not fluctuate randomly across fetches.',
      status: 'published',
    });

    // Fetch 1
    const fetch1 = await request(app).get(`/api/v1/metrics/${pub.id}`);
    expect(fetch1.status).toBe(200);

    // Fetch 2
    const fetch2 = await request(app).get(`/api/v1/metrics/${pub.id}`);
    expect(fetch2.status).toBe(200);

    // Fetch 3
    const fetch3 = await request(app).get(`/api/v1/metrics/${pub.id}`);
    expect(fetch3.status).toBe(200);

    // All three fetches must return identical stored numbers
    expect(fetch1.body.views).toBe(fetch2.body.views);
    expect(fetch2.body.views).toBe(fetch3.body.views);

    expect(fetch1.body.likes).toBe(fetch2.body.likes);
    expect(fetch2.body.likes).toBe(fetch3.body.likes);

    expect(fetch1.body.comments).toBe(fetch2.body.comments);
    expect(fetch1.body.shares).toBe(fetch2.body.shares);
    expect(fetch1.body.clicks).toBe(fetch2.body.clicks);
    expect(fetch1.body.collected_at).toBe(fetch2.body.collected_at);
  });

  it('stores and retrieves metrics after end-to-end publication in Simulation Mode', async () => {
    const dest = await dbRepository.getDestinationById('dest-discourse-001');
    if (dest) {
      dest.url = `${baseUrl}/mock/discourse`;
    }

    const pubRes = await request(app)
      .post('/api/v1/publish')
      .set('Idempotency-Key', `metrics-e2e-${Date.now()}`)
      .send({
        destination_id: 'dest-discourse-001',
        rendition: {
          title: 'Full Lifecycle Metrics Verification Post',
          body: 'Publishing content to verify metrics generation on real publication.',
          tags: ['ai', 'metrics'],
        },
      });

    expect(pubRes.status).toBe(200);
    const pubId = pubRes.body.publication.id;
    expect(pubId).toBeDefined();

    // Fetch metrics for this newly published post
    const mRes = await request(app).get(`/api/v1/metrics/${pubId}`);
    expect(mRes.status).toBe(200);
    expect(mRes.body.publication_id).toBe(pubId);
    expect(mRes.body.views).toBeGreaterThan(0);

    // Verify metrics record exists in database
    const stored = await dbRepository.getPublicationMetrics(pubId);
    expect(stored).not.toBeNull();
    expect(stored?.views).toBe(mRes.body.views);
    expect(stored?.likes).toBe(mRes.body.likes);
  });
});
