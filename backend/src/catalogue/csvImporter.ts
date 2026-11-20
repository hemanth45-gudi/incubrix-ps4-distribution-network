import { URL } from 'url';
import { dbRepository, DestinationRecord } from '../database/repository.js';
import { relevanceScorer } from '../recommender/relevanceScorer.js';

export interface CsvImportResult {
  import_id: string;
  filename: string;
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  duration_ms: number;
  row_errors: Array<{
    row_number: number;
    url?: string;
    field?: string;
    reason: string;
  }>;
  imported_destinations: DestinationRecord[];
}

export class CsvCatalogueImporter {
  /**
   * Normalizes a URL:
   * - Lowercases protocol and hostname
   * - Strips trailing slashes
   * - Removes tracking parameters (utm_*, ref, fbclid)
   * - Normalizes port (strips default 80 / 443)
   */
  public normalizeUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return rawUrl.trim().toLowerCase();
    }

    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Strip tracking parameters
    const paramsToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || lower === 'ref' || lower === 'fbclid' || lower === 'source') {
        paramsToDelete.push(key);
      }
    });
    for (const key of paramsToDelete) {
      parsed.searchParams.delete(key);
    }

    let normalized = parsed.toString();
    // Remove trailing slash if path is just root
    if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
      normalized = `${parsed.protocol}//${parsed.host}`;
    }
    return normalized.replace(/\/+$/, '');
  }

  /**
   * Parses and imports a CSV string of destinations
   */
  public async importCsv(csvContent: string, filename: string = 'catalogue.csv'): Promise<CsvImportResult> {
    const startedAt = Date.now();
    const importId = `imp-${Date.now()}`;
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return {
        import_id: importId,
        filename,
        total_rows: 0,
        valid_rows: 0,
        duplicate_rows: 0,
        invalid_rows: 0,
        duration_ms: Date.now() - startedAt,
        row_errors: [{ row_number: 1, reason: 'CSV is empty or missing data rows' }],
        imported_destinations: [],
      };
    }

    // Parse header
    const headers = this.parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const nameIdx = headers.indexOf('name');
    const urlIdx = headers.indexOf('url');
    const platformIdx = headers.indexOf('platform_key');
    const connectorIdx = headers.indexOf('connector_key');
    const categoryIdx = headers.indexOf('category');
    const audienceIdx = headers.indexOf('est_audience');
    const tagsIdx = headers.indexOf('audience_tags');
    const langIdx = headers.indexOf('language');

    const rowErrors: CsvImportResult['row_errors'] = [];
    const seenInCsv = new Set<string>();
    const existingList = await dbRepository.listDestinations();
    const existingKeys = new Set(existingList.map((d) => `${d.platform_key}::${this.normalizeUrl(d.url)}`));

    const toInsert: Partial<DestinationRecord>[] = [];
    let duplicateCount = 0;
    let invalidCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = this.parseCsvLine(line);

      const name = nameIdx !== -1 ? cols[nameIdx] : cols[0];
      const rawUrl = urlIdx !== -1 ? cols[urlIdx] : cols[1];
      const platformKey = (platformIdx !== -1 ? cols[platformIdx] : cols[2] || 'discourse').toLowerCase().trim();
      const connectorKey = connectorIdx !== -1 ? cols[connectorIdx] : platformKey;

      // Validate presence
      if (!name || !rawUrl) {
        invalidCount++;
        rowErrors.push({ row_number: i + 1, reason: 'Missing required field: name or url' });
        continue;
      }

      // Validate URL syntax
      let normalizedUrl: string;
      try {
        normalizedUrl = this.normalizeUrl(rawUrl);
        new URL(normalizedUrl);
      } catch {
        invalidCount++;
        rowErrors.push({ row_number: i + 1, url: rawUrl, field: 'url', reason: 'Malformed URL' });
        continue;
      }

      // Duplicate check: platform + normalized URL
      const uniqueKey = `${platformKey}::${normalizedUrl}`;
      if (seenInCsv.has(uniqueKey) || existingKeys.has(uniqueKey)) {
        duplicateCount++;
        rowErrors.push({
          row_number: i + 1,
          url: normalizedUrl,
          reason: `Duplicate detected for platform '${platformKey}' and URL '${normalizedUrl}'`,
        });
        continue;
      }

      seenInCsv.add(uniqueKey);

      // Parse tags
      const rawTags = tagsIdx !== -1 && cols[tagsIdx] ? cols[tagsIdx] : '';
      const tags = rawTags
        ? rawTags
            .split(/[,;|]/)
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        : ['general'];

      const estAudience = audienceIdx !== -1 && cols[audienceIdx] ? parseInt(cols[audienceIdx], 10) || 1000 : 1000;
      const category = categoryIdx !== -1 ? cols[categoryIdx] : 'technology';
      const language = langIdx !== -1 && cols[langIdx] ? cols[langIdx] : 'en';

      // Enrich destination with relevance score
      const relevance = relevanceScorer.score({
        name,
        category,
        audience_tags: tags,
      });

      toInsert.push({
        name,
        url: normalizedUrl,
        platform_key: platformKey,
        connector_key: connectorKey,
        surface: 'default',
        category,
        audience_tags: tags,
        language,
        est_audience: estAudience,
        relevance_score: relevance.score,
        relevance_reason: relevance.reason,
        level: 'L0',
        status: 'active',
      });
    }

    const importedDestinations: DestinationRecord[] = [];
    for (const d of toInsert) {
      const created = await dbRepository.createDestination(d);
      importedDestinations.push(created);
    }

    return {
      import_id: importId,
      filename,
      total_rows: lines.length - 1,
      valid_rows: importedDestinations.length,
      duplicate_rows: duplicateCount,
      invalid_rows: invalidCount,
      duration_ms: Date.now() - startedAt,
      row_errors: rowErrors,
      imported_destinations: importedDestinations,
    };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let insideQuotes = false;
    let entry = '';

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        insideQuotes = !insideQuotes;
      } else if (c === ',' && !insideQuotes) {
        result.push(entry.trim());
        entry = '';
      } else {
        entry += c;
      }
    }
    result.push(entry.trim());
    return result;
  }
}

export const csvCatalogueImporter = new CsvCatalogueImporter();
