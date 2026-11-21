import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { dbRepository } from '../database/repository.js';
import { mockState } from '../mocks/platformMocks.js';

describe('Recertification Service Integration Tests', () => {
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

    // Point seeded destination mock URLs to the active test server
    const dests = await dbRepository.listDestinations();
    for (const d of dests) {
      if (d.url.includes('localhost:3001')) {
        d.url = d.url.replace('http://localhost:3001', baseUrl);
      }
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/v1/certifications returns 200 with array of certification records', async () => {
    const res = await request(app).get('/api/v1/certifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('each certification record has required fields', async () => {
    const res = await request(app).get('/api/v1/certifications');
    expect(res.status).toBe(200);
    for (const cert of res.body) {
      expect(cert).toHaveProperty('destination_id');
      expect(cert).toHaveProperty('name');
      expect(cert).toHaveProperty('status');
      expect(cert).toHaveProperty('recertification_due');
      expect(typeof cert.recertification_due).toBe('boolean');
    }
  });

  it('destinations with recent last_certified_at have recertification_due=false', async () => {
    const res = await request(app).get('/api/v1/certifications');
    expect(res.status).toBe(200);
    const recentlyCertified = res.body.filter(
      (c: any) => c.days_since_certified !== undefined && c.days_since_certified < 30
    );
    for (const cert of recentlyCertified) {
      expect(cert.recertification_due).toBe(false);
    }
  });

  it('POST /api/v1/certifications/recertify-due returns 200 with summary fields and processed count', async () => {
    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_checked');
    expect(res.body).toHaveProperty('processed');
    expect(res.body).toHaveProperty('certified_count');
    expect(res.body).toHaveProperty('demoted_count');
    expect(res.body).toHaveProperty('outcomes');
    expect(Array.isArray(res.body.outcomes)).toBe(true);
  });

  it('POST with force_all:true recertifies all destinations and returns outcomes with details', async () => {
    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({ force_all: true });
    expect(res.status).toBe(200);
    expect(res.body.total_checked).toBeGreaterThan(0);
    expect(res.body.processed).toBe(res.body.total_checked);
    expect(res.body.outcomes.length).toBe(res.body.total_checked);

    for (const outcome of res.body.outcomes) {
      expect(outcome).toHaveProperty('destination_id');
      expect(outcome).toHaveProperty('destination_name');
      expect(outcome).toHaveProperty('name');
      expect(outcome).toHaveProperty('platform_key');
      expect(outcome).toHaveProperty('platform');
      expect(outcome).toHaveProperty('success');
      expect(outcome).toHaveProperty('result');
      expect(outcome).toHaveProperty('status');
      expect(outcome).toHaveProperty('reason');
      expect(outcome).toHaveProperty('timestamp');
      expect(outcome).toHaveProperty('steps_completed');
      expect(Array.isArray(outcome.steps_completed)).toBe(true);

      // Verify success status consistency
      if (outcome.success) {
        expect(outcome.result).toBe('certified');
        expect(outcome.status).toBe('active');
        expect(outcome.steps_completed.length).toBeGreaterThan(0);
      } else {
        expect(outcome.result).toBe('demoted');
        expect(outcome.status).toBe('demoted');
      }
    }
  }, 20000);

  it('saves certification runs and retrieves them via GET /api/v1/certifications/history', async () => {
    const historyRes = await request(app).get('/api/v1/certifications/history');
    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.length).toBeGreaterThan(0);

    const firstRun = historyRes.body[0];
    expect(firstRun).toHaveProperty('id');
    expect(firstRun).toHaveProperty('destination_id');
    expect(firstRun).toHaveProperty('success');
    expect(firstRun).toHaveProperty('status');
    expect(firstRun).toHaveProperty('reason');
    expect(firstRun).toHaveProperty('timestamp');
  });

  it('does NOT show a destination as successfully recertified when verification fails', async () => {
    // Add a test destination pointing to an unreachable endpoint
    const failingDest = await dbRepository.createDestination({
      name: 'Unreachable Test Node',
      url: 'http://127.0.0.1:9999/mock/nonexistent',
      platform_key: 'discourse',
      surface: 'topic',
      category: 'testing',
      audience_tags: ['test'],
      language: 'en',
      connector_key: 'discourse',
      relevance_score: 3.0,
      level: 'L1',
      status: 'active',
      last_certified_at: null,
      automation_allowed: true,
      self_promo_allowed: true,
      link_policy: 'allowed',
      disclosure_required: false,
    });

    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({ force_all: false }); // Destination with null last_certified_at is due

    expect(res.status).toBe(200);
    const failingOutcome = res.body.outcomes.find((o: any) => o.destination_id === failingDest.id);
    expect(failingOutcome).toBeDefined();

    // Must NOT be marked as successful
    expect(failingOutcome.success).toBe(false);
    expect(failingOutcome.result).toBe('demoted');
    expect(failingOutcome.status).toBe('demoted');
    expect(failingOutcome.new_status).toBe('demoted');
    expect(failingOutcome.reason).toBeDefined();

    // Verify database record was actually demoted
    const updated = await dbRepository.getDestinationById(failingDest.id);
    expect(updated?.status).toBe('demoted');
  });
});
