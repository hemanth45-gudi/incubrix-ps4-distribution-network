import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { storageService } from '../storage/storageService.js';

describe('Storage Subsystem & SSRF Protection Tests', () => {
  const app = createApp();

  it('blocks private loopback and AWS metadata URLs (SSRF Protection)', () => {
    expect(() => storageService.validateSafeUrl('http://localhost:3000/api')).toThrow(/SSRF Protection/);
    expect(() => storageService.validateSafeUrl('http://127.0.0.1/secrets')).toThrow(/SSRF Protection/);
    expect(() => storageService.validateSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow(/SSRF Protection/);
    expect(() => storageService.validateSafeUrl('http://10.0.0.1/admin')).toThrow(/SSRF Protection/);
    expect(() => storageService.validateSafeUrl('http://192.168.1.1/router')).toThrow(/SSRF Protection/);
  });

  it('allows safe public HTTPS URLs', () => {
    expect(() => storageService.validateSafeUrl('https://example.com/image.png')).not.toThrow();
    expect(() => storageService.validateSafeUrl('https://cdn.incubrix.org/asset.jpg')).not.toThrow();
  });

  it('stores and retrieves files via API endpoints', async () => {
    const uploadRes = await request(app)
      .post('/api/v1/storage/upload')
      .send({
        filename: 'report.txt',
        content: 'Verification report content text',
        mime_type: 'text/plain',
      });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.id).toBeDefined();
    expect(uploadRes.body.download_url).toBeDefined();

    const fileId = uploadRes.body.id;

    const downloadRes = await request(app).get(`/api/v1/storage/${fileId}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.text).toBe('Verification report content text');
  });
});
