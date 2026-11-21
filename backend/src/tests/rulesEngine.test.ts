import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { rulesEngine } from '../rules/rulesEngine.js';
import { dbRepository } from '../database/repository.js';

describe('Posting Rules Engine Unit & Integration Tests', () => {
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

  const baseDestination = {
    id: 'test-dest-rules',
    name: 'Rules Test Community',
    url: 'http://localhost:3001/mock/forum',
    platform_key: 'discourse',
    surface: 'topic',
    category: 'tech',
    audience_tags: ['devs'],
    language: 'en',
    self_promo_allowed: true,
    link_policy: 'allowed',
    disclosure_required: false,
    automation_allowed: true,
    connector_key: 'discourse',
    relevance_score: 4.0,
    level: 'L3',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  };

  // ==================================================
  // 1. UNIT TESTS: RULE SPEC ENFORCEMENT
  // ==================================================
  describe('Rule Evaluation Logic', () => {
    it('allows compliant content across all standard rules', async () => {
      const rendition = {
        title: 'Valid Educational Tutorial',
        body: 'In-depth guide to distributed connector architecture.',
      };

      const result = await rulesEngine.evaluate(rendition, baseDestination as any);
      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
      expect(result.reasons).toHaveLength(0);
      expect(result.decisions.every((d) => d.pass)).toBe(true);
    });

    it('blocks publication when community forbids automated bots (automation_allowed = false)', async () => {
      const dest = { ...baseDestination, automation_allowed: false };
      const rendition = { body: 'Content sent via bot' };

      const result = await rulesEngine.evaluate(rendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('route_assisted');
      expect(result.reasons[0]).toMatch(/forbids automated/);
    });

    it('detects and blocks promotional language when self_promo_allowed is false', async () => {
      const dest = { ...baseDestination, self_promo_allowed: false };
      const promoRendition = {
        title: 'Our New Product',
        body: 'Check out our service! Buy now and use discount code SAVE50 at checkout!',
      };

      const result = await rulesEngine.evaluate(promoRendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reasons[0]).toMatch(/Self-promotion is prohibited/);
      expect(result.reasons[0]).toMatch(/buy now/);
    });

    it('detects self-promotion in tags or title as well', async () => {
      const dest = { ...baseDestination, self_promo_allowed: false };
      const tagPromoRendition = {
        title: 'Exclusive Deal Announcement',
        body: 'Check our platform details.',
        tags: ['promo code', 'tech'],
      };

      const result = await rulesEngine.evaluate(tagPromoRendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
    });

    it('allows promotional language when self_promo_allowed is true', async () => {
      const dest = { ...baseDestination, self_promo_allowed: true };
      const promoRendition = {
        title: 'Special Discount',
        body: 'Use coupon code TEST50 for our early access.',
      };

      const result = await rulesEngine.evaluate(promoRendition, dest as any);
      expect(result.passed).toBe(true);
      expect(result.action).toBe('allow');
    });

    it('enforces link policy: blocks content with URLs when links are prohibited', async () => {
      const dest = { ...baseDestination, link_policy: 'prohibited' };
      const linkRendition = {
        body: 'Great discussion here: https://example.com/source',
      };

      const result = await rulesEngine.evaluate(linkRendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reasons[0]).toMatch(/Links are strictly prohibited/);
    });

    it('enforces link policy: blocks canonical_url when links are prohibited', async () => {
      const dest = { ...baseDestination, link_policy: 'prohibited' };
      const canonicalRendition = {
        body: 'Content without body links.',
        canonical_url: 'https://incubrix.org/original',
      };

      const result = await rulesEngine.evaluate(canonicalRendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reasons[0]).toMatch(/Links are strictly prohibited/);
    });

    it('enforces canonical_only link policy when links exist without canonical_url', async () => {
      const dest = { ...baseDestination, link_policy: 'canonical_only' };
      const linkRendition = {
        body: 'Article content mentioning https://partner.org/guide',
      };

      const result = await rulesEngine.evaluate(linkRendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.reasons[0]).toMatch(/canonical_only link policy, but no canonical_url was provided/);

      // Passes when canonical_url is provided
      const withCanonical = {
        ...linkRendition,
        canonical_url: 'https://incubrix.org/original-post',
      };
      const passResult = await rulesEngine.evaluate(withCanonical, dest as any);
      expect(passResult.passed).toBe(true);
    });

    it('enforces mandatory AI disclosure when content is AI-generated', async () => {
      const dest = { ...baseDestination, disclosure_required: true };
      const aiContentWithoutDisclosure = {
        title: 'AI Insights',
        body: 'Automated generated analysis without any note.',
        is_ai_generated: true,
      };

      const result = await rulesEngine.evaluate(aiContentWithoutDisclosure, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('block');
      expect(result.reasons[0]).toMatch(/mandates explicit AI disclosure/);

      // Passes when explicit ai_disclosure is provided
      const withField = {
        ...aiContentWithoutDisclosure,
        ai_disclosure: 'Assisted by IncuBrix AI Engine',
      };
      const passField = await rulesEngine.evaluate(withField, dest as any);
      expect(passField.passed).toBe(true);

      // Passes when #ai hashtag is in body
      const withHashtag = {
        ...aiContentWithoutDisclosure,
        body: 'Automated generated analysis with #ai tag included.',
      };
      const passTag = await rulesEngine.evaluate(withHashtag, dest as any);
      expect(passTag.passed).toBe(true);
    });

    it('enforces frequency cap: reschedules/blocks when post limit reached in window', async () => {
      const dest = {
        ...baseDestination,
        frequency_cap: { max_posts: 2, window_days: 7 },
      };

      // Simulate 2 previous publications
      await dbRepository.createPublication({ destination_id: dest.id, status: 'published' });
      await dbRepository.createPublication({ destination_id: dest.id, status: 'published' });

      const rendition = { body: 'Third post attempt' };
      const result = await rulesEngine.evaluate(rendition, dest as any);

      expect(result.passed).toBe(false);
      expect(result.action).toBe('reschedule');
      expect(result.reasons[0]).toMatch(/Frequency cap exceeded: 2\/2/);
    });

    it('handles stringified frequency cap JSON gracefully', async () => {
      const dest = {
        ...baseDestination,
        frequency_cap: JSON.stringify({ max_posts: 1, window_days: 7 }) as any,
      };

      await dbRepository.createPublication({ destination_id: dest.id, status: 'published' });

      const rendition = { body: 'Second post attempt' };
      const result = await rulesEngine.evaluate(rendition, dest as any);
      expect(result.passed).toBe(false);
      expect(result.action).toBe('reschedule');
    });
  });

  // ==================================================
  // 2. INTEGRATION TESTS: POST /api/v1/rules/evaluate
  // ==================================================
  describe('HTTP API /api/v1/rules/evaluate', () => {
    it('evaluates flat payload shape from frontend UI and returns verdict pass', async () => {
      const res = await request(app)
        .post('/api/v1/rules/evaluate')
        .send({
          destination_id: 'dest-discourse-001',
          title: 'Deep Learning with PyTorch',
          body: 'Educational guide on setting up custom autograd functions.',
          tags: ['pytorch', 'python'],
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(res.body.verdict).toBe('pass');
      expect(res.body.rules_matched).toBeGreaterThanOrEqual(4);
    });

    it('evaluates flat payload with self-promotion violation and returns verdict block', async () => {
      // dest-peertube-001 has rules
      const dest = await dbRepository.getDestinationById('dest-peertube-001');
      if (dest) {
        dest.self_promo_allowed = false;
      }

      const res = await request(app)
        .post('/api/v1/rules/evaluate')
        .send({
          destination_id: 'dest-peertube-001',
          title: 'Special Promo Video',
          body: 'Check out our platform! Buy now to get discount code 50OFF!',
          tags: ['promo'],
        });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(false);
      expect(res.body.verdict).toBe('block');
      expect(res.body.reasons.length).toBeGreaterThan(0);
      expect(res.body.reasons[0]).toContain('Self-promotion');
    });

    it('persists rule decisions in repository upon evaluation', async () => {
      await request(app)
        .post('/api/v1/rules/evaluate')
        .send({
          destination_id: 'dest-discourse-001',
          title: 'Audited Post',
          body: 'Testing decision persistence.',
          tags: ['audit'],
        });

      const decisions = await dbRepository.getRuleDecisions('dest-discourse-001');
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions.some((d) => d.rule_name === 'RULE_EVALUATION_SUMMARY')).toBe(true);
    });
  });
});
