import { describe, it, expect } from 'vitest';
import { destinationRecommender } from '../recommender/destinationRecommender.js';

describe('DestinationRecommender', () => {
  it('recommend() returns array of max 10 results', async () => {
    const results = await destinationRecommender.recommend({
      body: 'Some generic content about technology',
      tags: [],
    });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(10);
  });

  it('each result has required fields: rank, score, destination_id, destination_name, platform_key, reasons, warnings', async () => {
    const results = await destinationRecommender.recommend({
      body: 'Content about AI and machine learning for developers',
      tags: ['ai'],
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r).toHaveProperty('rank');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('destination_id');
      expect(r).toHaveProperty('destination_name');
      expect(r).toHaveProperty('platform_key');
      expect(r).toHaveProperty('reasons');
      expect(r).toHaveProperty('warnings');
      expect(Array.isArray(r.reasons)).toBe(true);
      expect(Array.isArray(r.warnings)).toBe(true);
    }
  });

  it('scores are sorted descending', async () => {
    const results = await destinationRecommender.recommend({
      body: 'AI startup founder content about SaaS',
      tags: ['ai', 'saas'],
    });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('recommend() with AI/saas tags => first result has rank 1 and score > 0', async () => {
    const results = await destinationRecommender.recommend({
      title: 'Building AI-powered SaaS products',
      body: 'Deep dive into AI tools, machine learning, and SaaS bootstrapping strategies',
      tags: ['ai', 'saas'],
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].rank).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('evaluatePrecisionAt10(): returns average_precision_at_10 as number between 0 and 1', async () => {
    const evalResult = await destinationRecommender.evaluatePrecisionAt10();
    expect(typeof evalResult.average_precision_at_10).toBe('number');
    expect(evalResult.average_precision_at_10).toBeGreaterThanOrEqual(0);
    expect(evalResult.average_precision_at_10).toBeLessThanOrEqual(1);
  });

  it('evaluatePrecisionAt10(): returns passed_benchmark field (boolean)', async () => {
    const evalResult = await destinationRecommender.evaluatePrecisionAt10();
    expect(typeof evalResult.passed_benchmark).toBe('boolean');
  });

  it('evaluatePrecisionAt10(): cases array has same length as evaluation dataset (5)', async () => {
    const evalResult = await destinationRecommender.evaluatePrecisionAt10();
    // evaluationDataset.json has 5 cases
    expect(evalResult.cases.length).toBe(5);
  });
});
