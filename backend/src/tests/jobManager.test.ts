import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { dbRepository } from '../database/repository.js';

describe('Background Jobs API & Progress Polling (/api/v1/jobs)', () => {
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

  it('returns HTTP 202 with job_id when async=true is specified', async () => {
    const payload = {
      destination_id: 'dest-devto-001',
      async: true,
      rendition: {
        title: 'Asynchronous Job Workflow',
        body: 'Executing publication as background job',
        canonical_url: 'https://incubrix.org/async',
      },
      connection: {
        base_url: `${baseUrl}/mock/devto`,
        api_key: 'valid_devto_key',
      },
    };

    const res = await request(app)
      .post('/api/v1/publish')
      .set('Idempotency-Key', 'async-job-tx-301')
      .send(payload);

    expect(res.status).toBe(202);
    expect(res.body.job_id).toBeDefined();
    expect(res.body.status).toBe('queued');
    const jobId = res.body.job_id;

    // Poll until succeeded (wait up to 1 second)
    let jobStatus: any;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const pollRes = await request(app).get(`/api/v1/jobs/${jobId}`);
      expect(pollRes.status).toBe(200);
      jobStatus = pollRes.body;
      if (jobStatus.status === 'succeeded') break;
    }

    expect(jobStatus.status).toBe('succeeded');
    expect(jobStatus.progress).toBe(100);
    expect(jobStatus.result.publication).toBeDefined();
  });
});
