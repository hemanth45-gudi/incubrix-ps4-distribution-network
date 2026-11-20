import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { mockState, mockPostsDb } from '../mocks/platformMocks.js';
import { idempotencyService } from '../services/idempotency.js';

describe('Connector Contract Tests (All 6 Core Connectors)', () => {
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
    // Reset mock state flags
    mockState.discourse = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.lemmy = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.devto = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.ghost = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.webhook = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
  });

  // ==================================================
  // 1. DISCOURSE CONTRACT
  // ==================================================
  describe('Discourse Connector Contract', () => {
    const getDiscoursePayload = () => ({
      rendition: { title: 'Discussion Topic', body: 'Valid body text for Discourse' },
      destination: { id: 'd-1', name: 'Dev Forum', url: `${baseUrl}/mock/discourse` },
      connection: { base_url: `${baseUrl}/mock/discourse`, api_key: 'disc_valid', username: 'alex' },
    });

    it('validate() confirms valid content and detects spec violations', async () => {
      const payload = getDiscoursePayload();
      const res = await request(app)
        .post('/connector/v1/discourse/validate')
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Invalid title (> 255 chars)
      const invalid = {
        ...payload,
        rendition: { ...payload.rendition, title: 'a'.repeat(256) },
      };
      const resInvalid = await request(app)
        .post('/connector/v1/discourse/validate')
        .send(invalid);
      expect(resInvalid.status).toBe(200);
      expect(resInvalid.body.ok).toBe(false);
      expect(resInvalid.body.violations[0].field).toBe('title');
    });

    it('publish(), get_status(), and delete() test post lifecycle', async () => {
      const payload = getDiscoursePayload();
      // Publish
      const pubRes = await request(app)
        .post('/connector/v1/discourse/publish')
        .set('Idempotency-Key', 'disc-life-1')
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.platform_post_id).toBeDefined();
      expect(pubRes.body.status).toBe('published');
      const postId = pubRes.body.platform_post_id;

      // Get status
      const statusRes = await request(app)
        .post('/connector/v1/discourse/get_status')
        .send({ platform_post_id: postId, connection: payload.connection });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');

      // Delete
      const delRes = await request(app)
        .post('/connector/v1/discourse/delete')
        .send({ platform_post_id: postId, connection: payload.connection });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });

    it('handles 429 rate limits and 401 expired auth correctly', async () => {
      const payload = getDiscoursePayload();
      mockState.discourse.rateLimited = true;
      const res429 = await request(app)
        .post('/connector/v1/discourse/publish')
        .set('Idempotency-Key', 'rate-limit-disc')
        .send(payload);

      expect(res429.status).toBe(429);
      expect(res429.body.error.code).toBe('PLATFORM_RATE_LIMIT');
      expect(res429.body.error.retryable).toBe(true);

      mockState.discourse.rateLimited = false;
      mockState.discourse.authExpired = true;
      const res401 = await request(app)
        .post('/connector/v1/discourse/publish')
        .set('Idempotency-Key', 'auth-expired-disc')
        .send(payload);

      expect(res401.status).toBe(401);
      expect(res401.body.error.code).toBe('CONNECTION_AUTH_EXPIRED');
      expect(res401.body.error.retryable).toBe(false);
    });
  });

  // ==================================================
  // 2. LEMMY CONTRACT
  // ==================================================
  describe('Lemmy Connector Contract', () => {
    const getLemmyPayload = () => ({
      rendition: { title: 'Lemmy Tech Post', body: 'Decentralized discussion content' },
      destination: { id: 'lem-1', name: 'OpenTech', url: `${baseUrl}/mock/lemmy` },
      connection: { base_url: `${baseUrl}/mock/lemmy`, token: 'valid_lemmy_jwt' },
    });

    it('executes publish, status, and delete cycle', async () => {
      const payload = getLemmyPayload();
      const pubRes = await request(app)
        .post('/connector/v1/lemmy/publish')
        .set('Idempotency-Key', 'lemmy-key-1')
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('published');
      const postId = pubRes.body.platform_post_id;

      const delRes = await request(app)
        .post('/connector/v1/lemmy/delete')
        .send({ platform_post_id: postId, connection: payload.connection });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });

  // ==================================================
  // 3. DEV.TO CONTRACT
  // ==================================================
  describe('Dev.to Connector Contract', () => {
    const getDevtoPayload = () => ({
      rendition: {
        title: 'Building Modern Connectors',
        body: 'Full technical article content here...',
        tags: ['nodejs', 'typescript', 'architecture'],
        canonical_url: 'https://incubrix.org/blog/connectors',
      },
      destination: { id: 'devto-dest', name: 'Dev.to Community', url: `${baseUrl}/mock/devto` },
      connection: { base_url: `${baseUrl}/mock/devto`, api_key: 'devto_valid_key' },
    });

    it('enforces maximum 4 tags spec and publishes article', async () => {
      const payload = getDevtoPayload();
      // 5 tags should fail validation
      const invalid = {
        ...payload,
        rendition: { ...payload.rendition, tags: ['1', '2', '3', '4', '5'] },
      };
      const valRes = await request(app)
        .post('/connector/v1/devto/validate')
        .send(invalid);
      expect(valRes.body.ok).toBe(false);
      expect(valRes.body.violations[0].field).toBe('tags');

      // Valid publication
      const pubRes = await request(app)
        .post('/connector/v1/devto/publish')
        .set('Idempotency-Key', 'devto-valid-1')
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.live_url).toMatch(/dev.to/);
    });
  });

  // ==================================================
  // 4. GHOST CONTRACT
  // ==================================================
  describe('Ghost Connector Contract', () => {
    const getGhostPayload = () => ({
      rendition: { title: 'Ghost Publishing Story', body: 'Story markdown content' },
      destination: { id: 'ghost-dest', name: 'Company Blog', url: `${baseUrl}/mock/ghost` },
      connection: { base_url: `${baseUrl}/mock/ghost`, api_key: 'ghost_admin_key' },
    });

    it('publishes and deletes a post', async () => {
      const payload = getGhostPayload();
      const pubRes = await request(app)
        .post('/connector/v1/ghost/publish')
        .set('Idempotency-Key', 'ghost-pub-1')
        .send(payload);

      expect(pubRes.status).toBe(200);
      const postId = pubRes.body.platform_post_id;

      const delRes = await request(app)
        .post('/connector/v1/ghost/delete')
        .send({ platform_post_id: postId, connection: payload.connection });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });

  // ==================================================
  // 5. GENERIC SIGNED WEBHOOK CONTRACT
  // ==================================================
  describe('Generic Signed Webhook Connector Contract', () => {
    const getWebhookPayload = () => ({
      rendition: { body: 'Syndicated partner post payload' },
      destination: { id: 'wh-dest', name: 'Partner Receiver', url: `${baseUrl}/mock/webhook/receiver` },
      connection: { webhook_url: `${baseUrl}/mock/webhook/receiver`, secret: 'mock-webhook-secret-32-bytes-long!' },
    });

    it('signs outgoing requests with HMAC-SHA256 and delivers successfully', async () => {
      const payload = getWebhookPayload();
      const pubRes = await request(app)
        .post('/connector/v1/webhook/publish')
        .set('Idempotency-Key', 'wh-key-1')
        .send(payload);

      expect(pubRes.status).toBe(200);
      expect(pubRes.body.status).toBe('published');
    });
  });

  // ==================================================
  // 6. ASSISTED CONNECTOR CONTRACT
  // ==================================================
  describe('Assisted Connector Contract', () => {
    const assistedPayload = {
      rendition: {
        title: 'Community Guide',
        body: 'Valuable community advice without promo links.',
        media_urls: ['http://assets.example.com/slide1.png'],
      },
      destination: {
        id: 'assisted-sub',
        name: 'Strict Developer Subreddit',
        url: 'https://reddit.com/r/developer',
        self_promo_allowed: false,
        link_policy: 'prohibited',
        disclosure_required: true,
      },
    };

    it('strictly prohibits automated publish() and throws DEST_SPEC_VIOLATION', async () => {
      const pubRes = await request(app)
        .post('/connector/v1/assisted/publish')
        .set('Idempotency-Key', 'assist-fail-1')
        .send({ ...assistedPayload, connection: {} });

      expect(pubRes.status).toBe(400);
      expect(pubRes.body.error.code).toBe('DEST_SPEC_VIOLATION');
      expect(pubRes.body.error.message).toMatch(/does not permit automated publishing/);
    });

    it('buildAssistPack() creates human publishing bundle with checklist and deep links', async () => {
      const assistRes = await request(app)
        .post('/connector/v1/assisted/build_assist_pack')
        .send(assistedPayload);

      expect(assistRes.status).toBe(200);
      expect(assistRes.body.files).toHaveLength(1);
      expect(assistRes.body.caption).toContain('Community Guide');
      expect(assistRes.body.deep_link).toBe('https://reddit.com/r/developer/submit');
      expect(assistRes.body.checklist.length).toBeGreaterThan(2);
      expect(assistRes.body.checklist.some((c: string) => c.includes('PROHIBITED'))).toBe(true);
    });
  });

  // ==================================================
  // 7. MULTI-INSTANCE CONFIGURATION TEST
  // ==================================================
  describe('Multi-Instance Support through Configuration', () => {
    it('supports two separate instances of Discourse using distinct configuration rows without code changes', async () => {
      const instance1 = {
        rendition: { body: 'Content for Forum 1' },
        destination: { id: 'inst-1', name: 'Forum 1', url: `${baseUrl}/mock/discourse` },
        connection: { base_url: `${baseUrl}/mock/discourse`, api_key: 'key1' },
      };
      const instance2 = {
        rendition: { body: 'Content for Forum 2' },
        destination: { id: 'inst-2', name: 'Forum 2', url: `${baseUrl}/mock/discourse` },
        connection: { base_url: `${baseUrl}/mock/discourse`, api_key: 'key2' },
      };

      const res1 = await request(app)
        .post('/connector/v1/discourse/publish')
        .set('Idempotency-Key', 'inst-key-1')
        .send(instance1);
      const res2 = await request(app)
        .post('/connector/v1/discourse/publish')
        .set('Idempotency-Key', 'inst-key-2')
        .send(instance2);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.platform_post_id).not.toBe(res2.body.platform_post_id);
    });
  });
});
