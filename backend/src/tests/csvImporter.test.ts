import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dbRepository before importing csvImporter
vi.mock('../database/repository.js', () => {
  const listDestinations = vi.fn(async () => []);
  const createDestination = vi.fn(async (data: any) => ({
    id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.name || 'Unnamed',
    url: data.url || 'http://localhost',
    platform_key: data.platform_key || 'discourse',
    surface: data.surface || 'default',
    category: data.category || null,
    audience_tags: data.audience_tags || [],
    language: data.language || 'en',
    geo: null,
    est_audience: data.est_audience || null,
    rules_url: null,
    frequency_cap: null,
    self_promo_allowed: data.self_promo_allowed ?? true,
    link_policy: data.link_policy || 'allowed',
    disclosure_required: data.disclosure_required ?? false,
    automation_allowed: data.automation_allowed ?? true,
    connector_key: data.connector_key || 'discourse',
    relevance_score: data.relevance_score || 3,
    relevance_reason: data.relevance_reason || null,
    level: data.level || 'L0',
    status: data.status || 'active',
    last_certified_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...data,
  }));

  return {
    dbRepository: { listDestinations, createDestination },
  };
});

import { csvCatalogueImporter } from '../catalogue/csvImporter.js';
import { dbRepository } from '../database/repository.js';

function makeCsv(rows: string[][]): string {
  const header = 'name,url,platform_key';
  return [header, ...rows.map((r) => r.join(','))].join('\n');
}

describe('CsvCatalogueImporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbRepository.listDestinations as any).mockResolvedValue([]);
  });

  // ---- normalizeUrl tests ----
  it('normalizeUrl: strips utm_source, lowercases hostname, strips trailing slash', () => {
    const result = csvCatalogueImporter.normalizeUrl(
      'https://Example.COM/page/?utm_source=newsletter&utm_medium=email',
    );
    expect(result).not.toContain('utm_source');
    expect(result).not.toContain('utm_medium');
    expect(result).toContain('example.com');
    expect(result).not.toMatch(/\/$/);
  });

  it('normalizeUrl: handles malformed URL gracefully', () => {
    const result = csvCatalogueImporter.normalizeUrl('not-a-valid-url-!!@#$');
    expect(typeof result).toBe('string');
    // Should return something (not throw)
  });

  // ---- importCsv tests ----
  it('importCsv: empty CSV returns row_errors with "empty" reason', async () => {
    const result = await csvCatalogueImporter.importCsv('');
    expect(result.row_errors.length).toBeGreaterThan(0);
    expect(result.row_errors[0].reason.toLowerCase()).toContain('empty');
  });

  it('importCsv: valid 3-row CSV imports all 3 destinations', async () => {
    const csv = makeCsv([
      ['Site Alpha', 'https://alpha.example.com', 'discourse'],
      ['Site Beta', 'https://beta.example.com', 'lemmy'],
      ['Site Gamma', 'https://gamma.example.com', 'devto'],
    ]);
    const result = await csvCatalogueImporter.importCsv(csv);
    expect(result.valid_rows).toBe(3);
    expect(result.imported_destinations.length).toBe(3);
  });

  it('importCsv: duplicate URL in same CSV => duplicate_rows: 1', async () => {
    const csv = makeCsv([
      ['Site A', 'https://dup.example.com', 'discourse'],
      ['Site B', 'https://dup.example.com', 'discourse'],
    ]);
    const result = await csvCatalogueImporter.importCsv(csv);
    expect(result.duplicate_rows).toBe(1);
  });

  it('importCsv: missing name or url => invalid_rows: 1', async () => {
    const csv = 'name,url,platform_key\n,https://noname.example.com,discourse\n';
    const result = await csvCatalogueImporter.importCsv(csv);
    expect(result.invalid_rows).toBe(1);
  });

  it('performance test: 1000-row CSV processes in < 60000ms', async () => {
    const rows: string[][] = [];
    for (let i = 0; i < 1000; i++) {
      rows.push([`Destination ${i}`, `https://dest${i}.example.com`, 'discourse']);
    }
    const csv = makeCsv(rows);

    const start = Date.now();
    const result = await csvCatalogueImporter.importCsv(csv);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(60000);
    expect(result.duration_ms).toBeLessThan(60000);
  }, 70000);

  it('row error format: has row_number and reason fields', async () => {
    const csv = 'name,url,platform_key\n,https://noname.example.com,discourse\n';
    const result = await csvCatalogueImporter.importCsv(csv);
    expect(result.row_errors.length).toBeGreaterThan(0);
    const err = result.row_errors[0];
    expect(err).toHaveProperty('row_number');
    expect(err).toHaveProperty('reason');
  });

  it('header validation: rejects CSV missing required "name" or "url" header', async () => {
    const invalidHeaderCsv = 'title_only,platform_key\nMy Site,discourse\n';
    const result = await csvCatalogueImporter.importCsv(invalidHeaderCsv);
    expect(result.valid_rows).toBe(0);
    expect(result.row_errors.length).toBeGreaterThan(0);
    expect(result.row_errors[0].field).toBe('headers');
    expect(result.row_errors[0].reason).toContain('missing required column header');
  });

  it('url validation: rejects non-http/https protocol and malformed URLs', async () => {
    const badUrlCsv = `name,url,platform_key
FTP Destination,ftp://files.example.com,discourse
Malformed Destination,not-a-url-scheme,discourse`;
    const result = await csvCatalogueImporter.importCsv(badUrlCsv);
    expect(result.invalid_rows).toBe(2);
    expect(result.valid_rows).toBe(0);
    expect(result.row_errors.every((e) => e.field === 'url')).toBe(true);
  });

  it('row-wise results: returns complete status for every row (imported, duplicate, invalid)', async () => {
    const mixedCsv = `name,url,platform_key
Valid Destination,https://valid1.example.com,discourse
Duplicate Destination,https://valid1.example.com,discourse
,https://noname.example.com,discourse`;
    const result = await csvCatalogueImporter.importCsv(mixedCsv);
    expect(result.total_rows).toBe(3);
    expect(result.valid_rows).toBe(1);
    expect(result.duplicate_rows).toBe(1);
    expect(result.invalid_rows).toBe(1);

    expect(result.row_results).toHaveLength(3);
    expect(result.row_results[0].status).toBe('imported');
    expect(result.row_results[0].row_number).toBe(2);

    expect(result.row_results[1].status).toBe('duplicate');
    expect(result.row_results[1].row_number).toBe(3);

    expect(result.row_results[2].status).toBe('invalid');
    expect(result.row_results[2].row_number).toBe(4);
  });
});
