import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { mockState, mockPostsDb } from '../mocks/platformMocks.js';
import { idempotencyService } from '../services/idempotency.js';

describe('New Connector Contract Tests (Hashnode, Slack, PeerTube)', () => {
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
    mockState.hashnode = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.slack = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
    mockState.peertube = { authExpired: false, rateLimited: false, unavailable: false, timeout: false };
  });

  // ==================================================
  // 1. HASHNODE CONTRACT
  // ==================================================
  describe('Hashnode Connector Contract', () => {
    const getHashnodePayload = () => ({
      rendition: {
        title: 'Hashnode Technical Article',
        body: 'This is a valid article body for Hashnode with enough content.',
        tags: ['ai', 'tech'],
      },
      destination: {
        id: 'dest-hn-1',
        name: 'Hashnode Blog',
        url: `${baseUrl}/mock/hashnode`,
        platform_key: 'hashnode',
        connector_key: 'hashnode',
        audience_tags: [],
        self_promo_allowed: true,
        link_policy: 'canonical_only',
        disclosure_required: false,
        automation_allowed: true,
        level: 'L3',
        status: 'active',
      },
      connection: {
        base_url: `${baseUrl}`,
        api_key: 'hn_valid_token',
        token: 'hn_valid_token',
      },
    });

    it('validate() with valid rendition returns {ok: true}', async () => {
      const res = await request(app)
        .post('/connector/v1/hashnode/validate')
        .send(getHashnodePayload());
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('validate() with empty body returns violations', async () => {
      const payload = getHashnodePayload();
      (payload.rendition as any).body = '';
      const res = await request(app)
        .post('/connector/v1/hashnode/validate')
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.violations.length).toBeGreaterThan(0);
    });

    it('publish() returns platform_post_id, live_url, status=published', async () => {
      const payload = {
        ...getHashnodePayload(),
        idempotency_key: `hn-test-${Date.now()}`,
      };
      const res = await request(app)
        .post('/connector/v1/hashnode/publish')
        .set('Idempotency-Key', payload.idempotency_key)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.platform_post_id).toBeDefined();
      expect(res.body.live_url).toBeDefined();
      expect(res.body.status).toBe('published');
    });

    it('get_status() returns {status: published} for existing post', async () => {
      const ikey = `hn-gs-${Date.now()}`;
      const pubPayload = { ...getHashnodePayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/hashnode/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const statusRes = await request(app)
        .post('/connector/v1/hashnode/get_status')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { base_url: baseUrl },
        });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');
    });

    it('delete() returns {deleted: true}', async () => {
      const ikey = `hn-del-${Date.now()}`;
      const pubPayload = { ...getHashnodePayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/hashnode/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const delRes = await request(app)
        .post('/connector/v1/hashnode/delete')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { base_url: baseUrl, api_key: 'hn_valid_token' },
        });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });

  // ==================================================
  // 2. SLACK CONTRACT
  // ==================================================
  describe('Slack Connector Contract', () => {
    const getSlackPayload = () => ({
      rendition: {
        title: 'Slack Announcement',
        body: 'Important announcement for the Slack channel community.',
        tags: ['founders'],
      },
      destination: {
        id: 'dest-slack-1',
        name: 'Founder Slack',
        url: `${baseUrl}/mock/slack/webhook`,
        platform_key: 'slack',
        connector_key: 'slack',
        audience_tags: [],
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: false,
        automation_allowed: true,
        level: 'L3',
        status: 'active',
      },
      connection: {
        webhook_url: `${baseUrl}/mock/slack/webhook`,
        token: 'slack_valid_token',
        channel: '#test-channel',
      },
    });

    it('validate() with valid rendition returns {ok: true}', async () => {
      const res = await request(app)
        .post('/connector/v1/slack/validate')
        .send(getSlackPayload());
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('publish() posts to Slack webhook and returns ts as platform_post_id', async () => {
      const ikey = `slack-pub-${Date.now()}`;
      const payload = { ...getSlackPayload(), idempotency_key: ikey };
      const res = await request(app)
        .post('/connector/v1/slack/publish')
        .set('Idempotency-Key', ikey)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.platform_post_id).toBeDefined();
      expect(res.body.status).toBe('published');
    });

    it('get_status() returns published status for existing message', async () => {
      const ikey = `slack-gs-${Date.now()}`;
      const pubPayload = { ...getSlackPayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/slack/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const statusRes = await request(app)
        .post('/connector/v1/slack/get_status')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { webhook_url: `${baseUrl}/mock/slack/webhook` },
        });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');
    });

    it('delete() removes the Slack message', async () => {
      const ikey = `slack-del-${Date.now()}`;
      const pubPayload = { ...getSlackPayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/slack/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const delRes = await request(app)
        .post('/connector/v1/slack/delete')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { webhook_url: `${baseUrl}/mock/slack/webhook` },
        });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });

  // ==================================================
  // 3. PEERTUBE CONTRACT
  // ==================================================
  describe('PeerTube Connector Contract', () => {
    const getPeerTubePayload = () => ({
      rendition: {
        title: 'Open Source Video Tutorial',
        body: 'A walkthrough of building open video software with PeerTube APIs.',
        tags: ['video', 'open-source'],
      },
      destination: {
        id: 'dest-pt-1',
        name: 'PeerTube Node',
        url: `${baseUrl}/mock/peertube`,
        platform_key: 'peertube',
        connector_key: 'peertube',
        audience_tags: [],
        self_promo_allowed: true,
        link_policy: 'allowed',
        disclosure_required: false,
        automation_allowed: true,
        level: 'L3',
        status: 'active',
      },
      connection: {
        base_url: baseUrl,
        token: 'pt_valid_token',
        api_key: 'pt_valid_token',
      },
    });

    it('validate() with valid rendition returns {ok: true}', async () => {
      const res = await request(app)
        .post('/connector/v1/peertube/validate')
        .send(getPeerTubePayload());
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('validate() with empty body returns violations', async () => {
      const payload = getPeerTubePayload();
      (payload.rendition as any).body = '';
      const res = await request(app)
        .post('/connector/v1/peertube/validate')
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
    });

    it('publish() returns uuid as platform_post_id', async () => {
      const ikey = `pt-pub-${Date.now()}`;
      const payload = { ...getPeerTubePayload(), idempotency_key: ikey };
      const res = await request(app)
        .post('/connector/v1/peertube/publish')
        .set('Idempotency-Key', ikey)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.platform_post_id).toBeDefined();
      expect(res.body.status).toBe('published');
    });

    it('get_status() returns published for existing video', async () => {
      const ikey = `pt-gs-${Date.now()}`;
      const pubPayload = { ...getPeerTubePayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/peertube/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const statusRes = await request(app)
        .post('/connector/v1/peertube/get_status')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { base_url: baseUrl },
        });
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.status).toBe('published');
    });

    it('delete() removes the video', async () => {
      const ikey = `pt-del-${Date.now()}`;
      const pubPayload = { ...getPeerTubePayload(), idempotency_key: ikey };
      const pubRes = await request(app)
        .post('/connector/v1/peertube/publish')
        .set('Idempotency-Key', ikey)
        .send(pubPayload);
      expect(pubRes.status).toBe(200);

      const delRes = await request(app)
        .post('/connector/v1/peertube/delete')
        .send({
          platform_post_id: pubRes.body.platform_post_id,
          connection: { base_url: baseUrl, token: 'pt_valid_token' },
        });
      expect(delRes.status).toBe(200);
      expect(delRes.body.deleted).toBe(true);
    });
  });
});
