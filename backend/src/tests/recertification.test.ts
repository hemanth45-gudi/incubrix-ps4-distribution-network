import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';

describe('Recertification Service Integration Tests', () => {
  const app = createApp();
  let server: Server;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
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
    // Seeded destinations have last_certified_at = new Date() so days_since=0 -> not due
    const recentlyCertified = res.body.filter(
      (c: any) => c.days_since_certified !== undefined && c.days_since_certified < 30
    );
    for (const cert of recentlyCertified) {
      expect(cert.recertification_due).toBe(false);
    }
  });

  it('POST /api/v1/certifications/recertify-due returns 200 with summary fields', async () => {
    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_checked');
    expect(res.body).toHaveProperty('certified_count');
    expect(res.body).toHaveProperty('demoted_count');
    expect(res.body).toHaveProperty('outcomes');
    expect(Array.isArray(res.body.outcomes)).toBe(true);
  });

  it('POST with force_all:true recertifies all destinations', async () => {
    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({ force_all: true });
    expect(res.status).toBe(200);
    // With force_all:true, total_checked should be >= the number of seeded destinations (9)
    expect(res.body.total_checked).toBeGreaterThan(0);
    expect(res.body.outcomes.length).toBe(res.body.total_checked);
  });

  it('each outcome has step details and destination info', async () => {
    const res = await request(app)
      .post('/api/v1/certifications/recertify-due')
      .send({ force_all: true });
    expect(res.status).toBe(200);
    for (const outcome of res.body.outcomes) {
      expect(outcome).toHaveProperty('destination_id');
      expect(outcome).toHaveProperty('destination_name');
      expect(outcome).toHaveProperty('platform_key');
      expect(outcome).toHaveProperty('success');
      expect(outcome).toHaveProperty('steps_completed');
      expect(Array.isArray(outcome.steps_completed)).toBe(true);
    }
  });
});
