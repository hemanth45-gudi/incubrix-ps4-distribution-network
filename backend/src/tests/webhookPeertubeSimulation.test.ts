import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { mockState, mockPostsDb } from '../mocks/platformMocks.js';
import { idempotencyService } from '../services/idempotency.js';
import { dbRepository } from '../database/repository.js';
import { connectorRegistry } from '@incubrix/connectors';

describe('Webhook & PeerTube Connectors Simulation Mode & Live Health Verification', () => {
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
    mockPostsDb.clear();
    mockState.webhook = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.peertube = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
  });

  // ==================================================
  // 1. DYNAMIC CONNECTOR HEALTH ENDPOINT (NOT HARDCODED)
  // ==================================================
  describe('GET /api/v1/connectors live health probe', () => {
    it('returns all 9 registered connectors with dynamically verified Healthy status', async () => {
      const res = await request(app).get('/api/v1/connectors');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(9);

      const keys = res.body.data.map((c: any) => c.key);
      expect(keys).toContain('webhook');
      expect(keys).toContain('peertube');
      expect(keys).toContain('discourse');
      expect(keys).toContain('lemmy');
      expect(keys).toContain('devto');
      expect(keys).toContain('ghost');
      expect(keys).toContain('assisted');
      expect(keys).toContain('hashnode');
      expect(keys).toContain('slack');

      const webhook = res.body.data.find((c: any) => c.key === 'webhook');
      expect(webhook.status).toBe('Healthy');
      expect(webhook.enabled).toBe(true);

      const peertube = res.body.data.find((c: any) => c.key === 'peertube');
      expect(peertube.status).toBe('Healthy');
      expect(peertube.enabled).toBe(true);
    });

    it('dynamically changes status to Unavailable when connector is disabled (proves NOT hardcoded)', async () => {
      const webhookConnector = connectorRegistry.get('webhook');
      const peertubeConnector = connectorRegistry.get('peertube');

      try {
        webhookConnector.enabled = false;
        peertubeConnector.enabled = false;

        const res = await request(app).get('/api/v1/connectors');
        expect(res.status).toBe(200);

        const webhook = res.body.data.find((c: any) => c.key === 'webhook');
        expect(webhook.status).toBe('Unavailable');
        expect(webhook.message).toContain('disabled');

        const peertube = res.body.data.find((c: any) => c.key === 'peertube');
        expect(peertube.status).toBe('Unavailable');
        expect(peertube.message).toContain('disabled');
      } finally {
        // Restore healthy state
        webhookConnector.enabled = true;
        peertubeConnector.enabled = true;
      }

      const restoredRes = await request(app).get('/api/v1/connectors');
      const webhookRestored = restoredRes.body.data.find((c: any) => c.key === 'webhook');
      const peertubeRestored = restoredRes.body.data.find((c: any) => c.key === 'peertube');
      expect(webhookRestored.status).toBe('Healthy');
      expect(peertubeRestored.status).toBe('Healthy');
    });
  });

  // ==================================================
  // 2. WEBHOOK CONNECTOR CONTRACT & SIMULATION MODE
  // ==================================================
  describe('Webhook Connector Contract & Simulation Lifecycle', () => {
    it('validates a standard webhook payload and returns valid: true', async () => {
      const res = await request(app)
        .post('/connector/v1/webhook/validate')
        .send({
          rendition: {
            title: 'Syndicated Article',
            body: 'Full syndicated content payload for partner network webhook distribution.',
            tags: ['saas', 'news'],
          },
          destination: {
            id: 'dest-webhook-val',
            name: 'Partner Webhook',
            url: `${baseUrl}/mock/webhook/receiver`,
            connector_key: 'webhook',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.valid).toBe(true);
    });

    it('validates flat payload shape from frontend UI and returns valid: true', async () => {
      const res = await request(app)
        .post('/connector/v1/webhook/validate')
        .send({
          destination_url: `${baseUrl}/mock/webhook/receiver`,
          title: 'UI Test Post',
          body: 'This is a test validation call from the UI.',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.message).toContain('passed');
    });

    it('validates payload and catches violations when body is empty', async () => {
      const res = await request(app)
        .post('/connector/v1/webhook/validate')
        .send({
          rendition: { title: 'No body', body: '' },
          destination: { id: 'dest-webhook-val', name: 'Partner', url: `${baseUrl}/mock/webhook/receiver` },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.valid).toBe(false);
      expect(res.body.violations.length).toBeGreaterThan(0);
    });

    it('publishes via /connector/v1/webhook/publish without explicit credentials in Simulation Mode', async () => {
      const ikey = `wh-sim-${Date.now()}`;
      const payload = {
        rendition: {
          title: 'Automated Partner Syndication Post',
          body: 'Content published to webhook mock in simulation mode without real credentials.',
          tags: ['saas'],
        },
        destination: {
          id: 'dest-webhook-001',
          name: 'Partner Syndication Network',
          url: `${baseUrl}/mock/webhook/receiver`,
        },
        connection: {
          base_url: baseUrl,
        },
      };

      const pubRes = await request(app)
        .post('/connector/v1/webhook/publish')
        .set('Idempotency-Key', ikey)
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('published');
      expect(pubRes.body.platform_post_id).toBeDefined();

      const eventId = pubRes.body.platform_post_id;

      // Status check
      const statusRes = await request(app)
        .post('/connector/v1/webhook/get_status')
        .send({
          platform_post_id: eventId,
          connection: { base_url: baseUrl },
        });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');

      // Delete check
      const delRes = await request(app)
        .post('/connector/v1/webhook/delete')
        .send({
          platform_post_id: eventId,
          connection: { base_url: baseUrl },
        });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Verify status is now deleted
      const postDeleteStatus = await request(app)
        .post('/connector/v1/webhook/get_status')
        .send({
          platform_post_id: eventId,
          connection: { base_url: baseUrl },
        });
      expect(postDeleteStatus.status).toBe(200);
      expect(postDeleteStatus.body.status).toBe('deleted');
    });

    it('publishes to dest-webhook-001 via /api/v1/publish end-to-end in Simulation Mode', async () => {
      const dest = await dbRepository.getDestinationById('dest-webhook-001');
      if (dest) {
        dest.url = `${baseUrl}/mock/webhook/receiver`;
      }

      const res = await request(app)
        .post('/api/v1/publish')
        .set('Idempotency-Key', `api-wh-${Date.now()}`)
        .send({
          destination_id: 'dest-webhook-001',
          rendition: {
            title: 'API V1 Webhook Publication',
            body: 'Direct end-to-end publication test through the publishing service in Simulation Mode.',
            tags: ['video', 'saas'],
          },
          // No credentials passed!
        });

      expect(res.status).toBe(200);
      expect(res.body.publication.id).toBeDefined();
      expect(res.body.publish_result.status).toBe('published');
      expect(res.body.publish_result.platform_post_id).toBeDefined();

      // Verify mock receiver received the event
      const eventId = res.body.publish_result.platform_post_id;
      const getRes = await request(baseUrl).get(`/mock/webhook/events/${eventId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(eventId);
    });
  });

  // ==================================================
  // 3. PEERTUBE CONNECTOR CONTRACT & SIMULATION MODE
  // ==================================================
  describe('PeerTube Connector Contract & Simulation Lifecycle', () => {
    it('validates a standard PeerTube payload and returns valid: true', async () => {
      const res = await request(app)
        .post('/connector/v1/peertube/validate')
        .send({
          rendition: {
            title: 'Federated Open Video Guide',
            body: 'Exploring ActivityPub video distribution with PeerTube.',
            tags: ['video', 'peertube', 'fediverse'],
          },
          destination: {
            id: 'dest-peertube-val',
            name: 'PeerTube Showcase',
            url: `${baseUrl}/mock/peertube`,
            connector_key: 'peertube',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.valid).toBe(true);
    });

    it('validates flat payload shape from frontend UI and returns valid: true', async () => {
      const res = await request(app)
        .post('/connector/v1/peertube/validate')
        .send({
          destination_url: `${baseUrl}/mock/peertube`,
          title: 'PeerTube UI Test Post',
          body: 'This is a test validation call for PeerTube.',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.valid).toBe(true);
    });

    it('rejects title longer than 120 chars as spec violation', async () => {
      const res = await request(app)
        .post('/connector/v1/peertube/validate')
        .send({
          rendition: {
            title: 'A'.repeat(125),
            body: 'Valid video description text.',
            tags: ['video'],
          },
          destination: {
            id: 'dest-pt-val',
            name: 'PeerTube',
            url: `${baseUrl}/mock/peertube`,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.violations[0].field).toBe('title');
    });

    it('publishes via /connector/v1/peertube/publish without explicit credentials in Simulation Mode', async () => {
      const ikey = `pt-sim-${Date.now()}`;
      const payload = {
        rendition: {
          title: 'PeerTube Showcase Video',
          body: 'Decentralized video published in simulation mode without real credentials.',
          tags: ['video', 'peertube'],
        },
        destination: {
          id: 'dest-peertube-001',
          name: 'PeerTube Open Video Showcase',
          url: `${baseUrl}/mock/peertube`,
        },
        connection: {
          base_url: baseUrl,
        },
      };

      const pubRes = await request(app)
        .post('/connector/v1/peertube/publish')
        .set('Idempotency-Key', ikey)
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('published');
      expect(pubRes.body.platform_post_id).toBeDefined();
      expect(pubRes.body.live_url).toContain('/w/');

      const videoId = pubRes.body.platform_post_id;

      // Status check
      const statusRes = await request(app)
        .post('/connector/v1/peertube/get_status')
        .send({
          platform_post_id: videoId,
          connection: { base_url: baseUrl },
        });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');

      // Fetch metrics
      const metricsRes = await request(app)
        .post('/connector/v1/peertube/fetch_metrics')
        .send({
          platform_post_id: videoId,
          connection: { base_url: baseUrl },
        });
      expect(metricsRes.status).toBe(200);
      expect(metricsRes.body.views).toBeGreaterThan(0);

      // Delete check
      const delRes = await request(app)
        .post('/connector/v1/peertube/delete')
        .send({
          platform_post_id: videoId,
          connection: { base_url: baseUrl },
        });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);

      // Verify status is now deleted
      const postDeleteStatus = await request(app)
        .post('/connector/v1/peertube/get_status')
        .send({
          platform_post_id: videoId,
          connection: { base_url: baseUrl },
        });
      expect(postDeleteStatus.status).toBe(200);
      expect(postDeleteStatus.body.status).toBe('deleted');
    });

    it('publishes to dest-peertube-001 via /api/v1/publish end-to-end in Simulation Mode', async () => {
      const dest = await dbRepository.getDestinationById('dest-peertube-001');
      if (dest) {
        dest.url = `${baseUrl}/mock/peertube`;
      }

      const res = await request(app)
        .post('/api/v1/publish')
        .set('Idempotency-Key', `api-pt-${Date.now()}`)
        .send({
          destination_id: 'dest-peertube-001',
          rendition: {
            title: 'API V1 PeerTube Video',
            body: 'Direct end-to-end publication test to PeerTube destination in Simulation Mode.',
            tags: ['video', 'creators'],
          },
          // No credentials passed!
        });

      expect(res.status).toBe(200);
      expect(res.body.publication.id).toBeDefined();
      expect(res.body.publish_result.status).toBe('published');
      expect(res.body.publish_result.platform_post_id).toBeDefined();

      // Verify mock server has the video
      const videoId = res.body.publish_result.platform_post_id;
      const getRes = await request(baseUrl).get(`/mock/peertube/api/v1/videos/${videoId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.uuid).toBe(videoId);
    });
  });
});
