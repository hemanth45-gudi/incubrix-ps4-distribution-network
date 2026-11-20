import { describe, it, expect, beforeEach } from 'vitest';
import { rulesEngine } from '../rules/rulesEngine.js';
import { dbRepository } from '../database/repository.js';

describe('Posting Rules Engine Unit Tests', () => {
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

  it('allows compliant content across all standard rules', async () => {
    const rendition = {
      title: 'Valid Educational Tutorial',
      body: 'In-depth guide to distributed connector architecture.',
    };

    const result = await rulesEngine.evaluate(rendition, baseDestination as any);
    expect(result.passed).toBe(true);
    expect(result.action).toBe('allow');
    expect(result.reasons).toHaveLength(0);
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

  it('enforces canonical_only link policy when links exist without canonical_url', async () => {
    const dest = { ...baseDestination, link_policy: 'canonical_only' };
    const linkRendition = {
      body: 'Article content mentioning https://partner.org/guide',
    };

    const result = await rulesEngine.evaluate(linkRendition, dest as any);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/canonical_only link policy, but no canonical_url was provided/);

    // Should pass when canonical_url is provided
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
    expect(result.reasons[0]).toMatch(/mandates explicit AI disclosure/);

    // Passes when disclosure is provided
    const aiContentWithDisclosure = {
      ...aiContentWithoutDisclosure,
      ai_disclosure: 'Assisted by IncuBrix AI Engine',
    };
    const passResult = await rulesEngine.evaluate(aiContentWithDisclosure, dest as any);
    expect(passResult.passed).toBe(true);
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
});
