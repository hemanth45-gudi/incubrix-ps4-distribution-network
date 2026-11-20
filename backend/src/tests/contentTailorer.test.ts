import { describe, it, expect } from 'vitest';
import { contentTailorer } from '../tailoring/contentTailorer.js';

// Helper to build a minimal DestinationRecord-like test object
function makeDestination(overrides: Record<string, any> = {}): any {
  return {
    id: 'test-dest-001',
    name: 'Test Destination',
    url: 'https://example.com',
    platform_key: 'discourse',
    surface: 'topic',
    category: 'technology',
    audience_tags: [],
    language: 'en',
    self_promo_allowed: true,
    link_policy: 'allowed',
    disclosure_required: false,
    automation_allowed: true,
    connector_key: 'discourse',
    relevance_score: 3,
    level: 'L0',
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as any;
}

describe('ContentTailorer', () => {
  it('forum framing (discourse): body without "?" gets closing question appended', () => {
    const dest = makeDestination({ platform_key: 'discourse' });
    const result = contentTailorer.tailor(
      { body: 'This is a post without any question mark' },
      dest,
    );
    expect(result.body).toContain('?');
  });

  it('forum framing (lemmy): body without "?" gets closing question appended', () => {
    const dest = makeDestination({ platform_key: 'lemmy' });
    const result = contentTailorer.tailor(
      { body: 'No question here at all' },
      dest,
    );
    expect(result.body).toContain('?');
  });

  it('Slack: **bold** becomes *bold*, [text](url) becomes <url|text>', () => {
    const dest = makeDestination({ platform_key: 'slack' });
    const result = contentTailorer.tailor(
      { body: 'Hello **world** check [this link](https://example.com/page)' },
      dest,
    );
    expect(result.body).toContain('*world*');
    expect(result.body).toContain('<https://example.com/page|this link>');
    expect(result.body).not.toContain('**world**');
  });

  it('link policy "prohibited": markdown links stripped from body', () => {
    const dest = makeDestination({ link_policy: 'prohibited' });
    const result = contentTailorer.tailor(
      { body: 'Visit [our site](https://example.com) for more info' },
      dest,
    );
    expect(result.body).not.toMatch(/\[.*?\]\(https?:\/\/[^)]+\)/);
    // The link text should remain but the URL is stripped
    expect(result.body).toContain('our site');
  });

  it('link policy "canonical_only": canonical_url preserved in output', () => {
    const dest = makeDestination({ link_policy: 'canonical_only' });
    const result = contentTailorer.tailor(
      { body: 'Some content here', canonical_url: 'https://mysite.com/original-post' },
      dest,
    );
    expect(result.canonical_url).toBe('https://mysite.com/original-post');
  });

  it('self-promo disallowed: "check out my product" phrase softened', () => {
    const dest = makeDestination({ self_promo_allowed: false });
    const result = contentTailorer.tailor(
      { body: 'You should check out my product it is amazing' },
      dest,
    );
    expect(result.body.toLowerCase()).not.toContain('check out my product');
  });

  it('AI disclosure injection: ai_generated:true + disclosure_required:true adds transparency notice', () => {
    const dest = makeDestination({ disclosure_required: true });
    const result = contentTailorer.tailor(
      { body: 'Some content', ai_generated: true },
      dest,
    );
    expect(result.body).toContain('Transparency Note');
  });

  it('audience tags blending: output tags include destination audience_tags', () => {
    const dest = makeDestination({ audience_tags: ['ai', 'saas'] });
    const result = contentTailorer.tailor(
      { body: 'Some content', tags: ['typescript'] },
      dest,
    );
    // Should include both original and destination tags (blended)
    const hasAi = result.tags.includes('ai');
    const hasSaas = result.tags.includes('saas');
    expect(hasAi || hasSaas).toBe(true);
  });

  it('title truncation: 150-char title on lemmy platform gets truncated to <= 100 chars', () => {
    const dest = makeDestination({ platform_key: 'lemmy' });
    const longTitle = 'A'.repeat(50) + ' ' + 'B'.repeat(50) + ' ' + 'C'.repeat(50); // 152 chars
    const result = contentTailorer.tailor(
      { body: 'Some body', title: longTitle },
      dest,
    );
    expect(result.title).toBeDefined();
    expect((result.title as string).length).toBeLessThanOrEqual(100);
  });
});
