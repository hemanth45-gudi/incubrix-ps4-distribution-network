import { describe, it, expect } from 'vitest';
import { relevanceScorer } from '../recommender/relevanceScorer.js';

describe('RelevanceScorer', () => {
  it('scores an AI-focused destination >= 4', () => {
    const result = relevanceScorer.score({
      name: 'AI Developer Hub',
      category: 'artificial intelligence',
      audience_tags: ['ai', 'machine learning', 'llm', 'openai', 'automation'],
      description: 'Community for AI, ML, deep learning and prompt engineering',
    });
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it('scores a video + creators destination and includes video in matched_verticals', () => {
    const result = relevanceScorer.score({
      name: 'Video Creator Network',
      category: 'media production',
      audience_tags: ['video', 'creators', 'content creator'],
      description: 'Platform for video editing and streaming content creators',
    });
    expect(result.matched_verticals).toContain('video');
  });

  it('scores a general destination with no keywords => score === 1', () => {
    const result = relevanceScorer.score({
      name: 'Generic Community Board',
      category: undefined,
      audience_tags: [],
      description: '',
    });
    expect(result.score).toBe(1);
  });

  it('scores with 3+ matching verticals => score === 5', () => {
    // Need >= 2 verticals AND maxHit >= 4 to get score 5
    // Let's load up ai, video, saas, founders, creators, marketing
    const result = relevanceScorer.score({
      name: 'AI SaaS Founders Video Marketing Hub',
      category: 'artificial intelligence',
      audience_tags: ['ai', 'saas', 'founders', 'video', 'creators', 'marketing'],
      description:
        'An all-in-one platform for AI, machine learning, llm, saas, bootstrapping, video streaming, marketing, content creator community',
    });
    expect(result.score).toBe(5);
  });

  it('reason string is non-empty and starts with "Score"', () => {
    const result = relevanceScorer.score({
      name: 'AI Startup Community',
      audience_tags: ['ai', 'startup'],
    });
    expect(result.reason).toBeTruthy();
    expect(result.reason.startsWith('Score')).toBe(true);
  });

  it('vertical_scores is an object with all 6 keys', () => {
    const result = relevanceScorer.score({
      name: 'Test Destination',
      audience_tags: [],
    });
    const keys = Object.keys(result.vertical_scores);
    expect(keys).toContain('ai');
    expect(keys).toContain('video');
    expect(keys).toContain('marketing');
    expect(keys).toContain('saas');
    expect(keys).toContain('creators');
    expect(keys).toContain('founders');
    expect(keys).toHaveLength(6);
  });
});
