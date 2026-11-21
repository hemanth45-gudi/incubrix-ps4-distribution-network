import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importCatalogue, fetchImportHistory } from './api.js';

describe('Frontend API: Catalogue Import Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('importCatalogue sends pasted CSV under the expected "csv_content" field with application/json', async () => {
    const csvContent = 'name,url,platform_key\nTech Forum,https://forum.example.com,discourse';
    const mockResponse = {
      import_id: 'imp-12345',
      filename: 'my_catalogue.csv',
      total_rows: 1,
      valid_rows: 1,
      duplicate_rows: 0,
      invalid_rows: 0,
      duration_ms: 45,
      row_results: [
        {
          row_number: 2,
          status: 'imported',
          name: 'Tech Forum',
          url: 'https://forum.example.com',
          platform: 'discourse',
        },
      ],
      errors: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    global.fetch = fetchMock;

    const result = await importCatalogue(csvContent, 'my_catalogue.csv');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/catalogue/import');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });

    const sentBody = JSON.parse(options.body as string);
    expect(sentBody).toHaveProperty('csv_content');
    expect(sentBody.csv_content).toBe(csvContent);
    expect(sentBody.filename).toBe('my_catalogue.csv');

    expect(result.valid_rows).toBe(1);
    expect(result.row_results).toHaveLength(1);
    expect(result.row_results![0].status).toBe('imported');
  });

  it('importCatalogue falls back to default filename when none is provided', async () => {
    const csvContent = 'name,url\nTest,https://test.org';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ total_rows: 1, valid_rows: 1, duplicate_rows: 0, invalid_rows: 0, duration_ms: 10 }),
    });
    global.fetch = fetchMock;

    await importCatalogue(csvContent);

    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.filename).toBe('catalogue.csv');
    expect(sentBody.csv_content).toBe(csvContent);
  });

  it('fetchImportHistory retrieves import history array', async () => {
    const mockHistory = [
      {
        id: 'imp-1',
        created_at: '2026-11-21T12:00:00Z',
        total_rows: 10,
        valid_rows: 8,
        duplicate_rows: 1,
        invalid_rows: 1,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockHistory,
    });

    const history = await fetchImportHistory();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('imp-1');
    expect(history[0].valid_rows).toBe(8);
  });
});
