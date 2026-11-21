import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { createApp } from '../app.js';
import { destinationRecommender } from '../recommender/destinationRecommender.js';
import { aiRuleCaptureService } from '../rules/aiRuleCapture.js';
import { dbRepository } from '../database/repository.js';
import { csvCatalogueImporter } from '../catalogue/csvImporter.js';

describe('End-to-End Audit: Recommendations, Rules Capture, Catalogue & Import', () => {
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

  // ============================================================
  // 1. RECOMMENDATIONS & PRECISION@10
  // ============================================================
  describe('Recommendations & Precision@10 Evaluation', () => {
    it('recommend() returns the actual top 10 destinations with scores, reasons, and warnings', async () => {
      const results = await destinationRecommender.recommend(
        {
          title: 'Deploying Large Language Model Pipelines with PyTorch and Transformers',
          body: 'Technical architectural deep-dive into LLM fine-tuning, inference optimization, batch scheduling, and ML serving.',
          tags: ['ai', 'developers', 'saas'],
          is_commercial: false,
        },
        10
      );

      expect(results).toHaveLength(10);
      expect(results[0].rank).toBe(1);
      expect(results[0].score).toBeGreaterThan(0);

      // Verify each result has required attributes and valid structure
      for (let i = 0; i < results.length; i++) {
        const item = results[i];
        expect(item.rank).toBe(i + 1);
        expect(item.destination_id).toBeDefined();
        expect(item.destination_name).toBeDefined();
        expect(item.name).toBe(item.destination_name);
        expect(item.platform_key).toBeDefined();
        expect(item.platform).toBe(item.platform_key);
        expect(typeof item.score).toBe('number');
        expect(Array.isArray(item.reasons)).toBe(true);
        expect(item.reasons.length).toBeGreaterThan(0);
        expect(Array.isArray(item.warnings)).toBe(true);
        expect(item.destination).toBeDefined();

        // Monotonically decreasing score order
        if (i > 0) {
          expect(results[i - 1].score).toBeGreaterThanOrEqual(item.score);
        }
      }
    });

    it('evaluatePrecisionAt10() passes the >= 0.80 precision benchmark on ground truth dataset', async () => {
      const evalResult = await destinationRecommender.evaluatePrecisionAt10();

      expect(evalResult.average_precision_at_10).toBeGreaterThanOrEqual(0.80);
      expect(evalResult.passed_benchmark).toBe(true);
      expect(evalResult.cases).toHaveLength(5);

      for (const c of evalResult.cases) {
        expect(c.case_id).toBeDefined();
        expect(c.name).toBeDefined();
        expect(c.query).toBeDefined();
        expect(c.precision_at_10).toBeGreaterThanOrEqual(0.80);
        expect(c.precision).toBe(c.precision_at_10);
        expect(c.top_10_destinations).toHaveLength(10);
        expect(c.relevant_count).toBeGreaterThanOrEqual(8);
      }
    });

    it('POST /api/v1/recommendations endpoint returns top 10 recommendations with aliases', async () => {
      const res = await request(app)
        .post('/api/v1/recommendations')
        .send({
          title: 'Bootstrapping B2B Micro-SaaS to $50k ARR',
          body: 'Lessons learned building in public, pricing tiers, customer retention, and organic distribution for founders.',
          tags: ['founders', 'saas', 'marketing'],
          is_commercial: false,
          limit: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.recommendations).toBeDefined();
      expect(res.body.recommendations).toHaveLength(10);
      expect(res.body.count).toBe(10);

      const top = res.body.recommendations[0];
      expect(top.rank).toBe(1);
      expect(top.name).toBeDefined();
      expect(top.platform).toBeDefined();
      expect(top.reasons.length).toBeGreaterThan(0);
    });

    it('POST /api/v1/recommendations/evaluate endpoint returns precision benchmark', async () => {
      const res = await request(app)
        .post('/api/v1/recommendations/evaluate')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.passed_benchmark).toBe(true);
      expect(res.body.average_precision_at_10).toBeGreaterThanOrEqual(0.80);
      expect(res.body.cases).toHaveLength(5);
    });
  });

  // ============================================================
  // 2. AI RULES CAPTURE & HUMAN CONFIRMATION
  // ============================================================
  describe('AI Rules Capture & Human Review Flow', () => {
    it('captures rules in pending_confirmation state and extracts policies accurately', async () => {
      const policyText = `
        Community Posting Guidelines:
        1. Rate Limit: Members may publish at most 2 posts per week.
        2. No self-promotion: Strictly zero tolerance for self-promotional content or product advertising.
        3. External links: Cross-posts must specify canonical URL; all other links prohibited.
        4. Artificial Intelligence: AI disclosure is required for all AI-assisted or generated content.
        5. Automated submissions: No bots or automated scripts permitted. Manual submissions only.
      `;

      const captureRes = await request(app)
        .post('/api/v1/rules/capture')
        .send({
          policy_text: policyText,
          destination_id: 'dest-discourse-001',
        });

      expect(captureRes.status).toBe(201);
      expect(captureRes.body.draft_id).toBeDefined();
      expect(captureRes.body.capture_id).toBe(captureRes.body.draft_id);
      expect(captureRes.body.status).toBe('pending_confirmation');
      expect(captureRes.body.draft_rules).toHaveLength(5);

      const rules = captureRes.body.extracted_rules;
      expect(rules.frequency_cap).toEqual({ max_posts: 2, window_days: 7 });
      expect(rules.self_promo_allowed).toBe(false);
      expect(rules.disclosure_required).toBe(true);
      expect(rules.automation_allowed).toBe(false);
      expect(rules.confidence).toBeGreaterThanOrEqual(0.8);
      expect(rules.evidence.length).toBeGreaterThan(2);
    });

    it('confirmRules(confirmed: false) marks draft rejected and DOES NOT alter destination', async () => {
      const destBefore = await dbRepository.getDestinationById('dest-ghost-001');
      expect(destBefore).not.toBeNull();
      const originalPromo = destBefore!.self_promo_allowed;

      // Capture strict anti-promo policy
      const draft = await aiRuleCaptureService.captureRules({
        source_text: 'Strict rule: zero tolerance for self promotion! No self-promotion allowed.',
        destination_id: 'dest-ghost-001',
      });

      // Human operator rejects the extracted rules
      const confirmRes = await request(app)
        .post('/api/v1/rules/confirm')
        .send({
          draft_id: draft.draft_id,
          confirmed: false,
          reviewed_by: 'reviewer_jane',
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.draft.status).toBe('rejected');

      // Verify destination was NOT modified
      const destAfter = await dbRepository.getDestinationById('dest-ghost-001');
      expect(destAfter!.self_promo_allowed).toBe(originalPromo);
    });

    it('confirmRules(confirmed: true) applies extracted rules to destination after confirmation', async () => {
      // 1. Create a dedicated destination for testing
      const testDest = await dbRepository.createDestination({
        name: 'Human Review Test Community',
        url: 'https://community.test.org/review',
        platform_key: 'discourse',
        connector_key: 'discourse',
        self_promo_allowed: true,
        disclosure_required: false,
        automation_allowed: true,
      });

      // 2. Capture policy rules with AI
      const captureRes = await request(app)
        .post('/api/v1/rules/capture')
        .send({
          source_text: 'Community guidelines: 1 post per week maximum. AI disclosure is required for all posts. Strictly no self-promotion.',
          destination_id: testDest.id,
        });

      expect(captureRes.status).toBe(201);
      const draftId = captureRes.body.draft_id;

      // 3. Confirm rules with human approval
      const confirmRes = await request(app)
        .post('/api/v1/rules/confirm')
        .send({
          draft_id: draftId,
          confirmed: true,
          reviewed_by: 'compliance_officer',
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.draft.status).toBe('confirmed');
      expect(confirmRes.body.updated_destination).toBeDefined();

      // 4. Verify the destination record in the database was updated
      const updatedDest = await dbRepository.getDestinationById(testDest.id);
      expect(updatedDest).not.toBeNull();
      expect(updatedDest!.self_promo_allowed).toBe(false);
      expect(updatedDest!.disclosure_required).toBe(true);
      expect(updatedDest!.frequency_cap?.max_posts).toBe(1);
    });
  });

  // ============================================================
  // 3. DESTINATION CATALOGUE & CRUD
  // ============================================================
  describe('Destination Catalogue & CRUD Operations', () => {
    it('GET /api/v1/destinations returns real records with scores and certification details', async () => {
      const res = await request(app).get('/api/v1/destinations');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(20);

      const sample = res.body.find((d: any) => d.id === 'dest-discourse-001');
      expect(sample).toBeDefined();
      expect(sample.name).toBe('Discourse Dev Hub');
      expect(sample.status).toBe('active');
      expect(sample.relevance_score).toBeGreaterThan(0);
      expect(sample.last_certified_at).toBeDefined();
    });

    it('GET /api/v1/destinations supports filtering by platform_key, category, and search', async () => {
      // Filter by platform
      const discourseRes = await request(app).get('/api/v1/destinations?platform_key=discourse');
      expect(discourseRes.status).toBe(200);
      expect(discourseRes.body.length).toBeGreaterThan(0);
      expect(discourseRes.body.every((d: any) => d.platform_key === 'discourse')).toBe(true);

      // Filter by category
      const aiRes = await request(app).get('/api/v1/destinations?category=ai');
      expect(aiRes.status).toBe(200);
      expect(aiRes.body.length).toBeGreaterThan(0);
      expect(aiRes.body.every((d: any) => d.category === 'ai')).toBe(true);

      // Search query
      const searchRes = await request(app).get('/api/v1/destinations?search=hugging');
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.length).toBeGreaterThan(0);
      expect(searchRes.body.some((d: any) => d.name.toLowerCase().includes('hugging'))).toBe(true);
    });

    it('POST /api/v1/destinations validates input, creates record, and computes relevance score', async () => {
      // Validation failure: missing url
      const failRes = await request(app)
        .post('/api/v1/destinations')
        .send({ name: 'Incomplete Destination' });
      expect(failRes.status).toBe(400);

      // Valid creation
      const createRes = await request(app)
        .post('/api/v1/destinations')
        .send({
          name: 'Rust Systems Programming Hub',
          url: 'https://users.rust-lang.org',
          platform_key: 'discourse',
          connector_key: 'discourse',
          category: 'software',
          audience_tags: ['software', 'developers', 'rust'],
          language: 'en',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeDefined();
      expect(createRes.body.name).toBe('Rust Systems Programming Hub');
      expect(createRes.body.relevance_score).toBeGreaterThan(0);
      expect(createRes.body.relevance_reason).toBeDefined();

      const newId = createRes.body.id;

      // GET by id
      const getRes = await request(app).get(`/api/v1/destinations/${newId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.name).toBe('Rust Systems Programming Hub');

      // PATCH update
      const patchRes = await request(app)
        .patch(`/api/v1/destinations/${newId}`)
        .send({ est_audience: 88000, category: 'systems' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.est_audience).toBe(88000);
      expect(patchRes.body.category).toBe('systems');

      // DELETE
      const deleteRes = await request(app).delete(`/api/v1/destinations/${newId}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.deleted).toBe(true);
    });
  });

  // ============================================================
  // 4. CATALOGUE IMPORT (CSV)
  // ============================================================
  describe('Catalogue CSV Import, Duplicate Detection & Reporting', () => {
    it('imports valid CSV records and stores history', async () => {
      const csv = `name,url,platform_key,connector_key,category,audience_tags,est_audience,language
Kotlin Discourse Forum,https://discuss.kotlinlang.org,discourse,discourse,software,developers;software;jvm,60000,en
Zig Software Community,https://ziggit.dev,discourse,discourse,software,developers;systems;zig,25000,en`;

      const res = await request(app)
        .post('/api/v1/catalogue/import')
        .send({ csv_content: csv, filename: 'dev_forums.csv' });

      expect(res.status).toBe(200);
      expect(res.body.total_rows).toBe(2);
      expect(res.body.valid_rows).toBe(2);
      expect(res.body.duplicate_rows).toBe(0);
      expect(res.body.invalid_rows).toBe(0);
      expect(res.body.imported_destinations).toHaveLength(2);

      // Verify import history
      const historyRes = await request(app).get('/api/v1/catalogue/imports');
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.length).toBeGreaterThan(0);
      const latest = historyRes.body[0];
      expect(latest.valid_rows).toBe(2);
      expect(latest.id).toBeDefined();
    });

    it('detects duplicates on platform_key and normalized URL', async () => {
      // Import existing destination URL with tracking params to verify normalization
      const duplicateCsv = `name,url,platform_key,connector_key,category,audience_tags,est_audience,language
Kotlin Duplicate,https://discuss.kotlinlang.org/?utm_source=twitter&ref=newsletter,discourse,discourse,software,developers,60000,en
Kotlin Duplicate 2,https://discuss.kotlinlang.org/,discourse,discourse,software,developers,60000,en`;

      const res = await request(app)
        .post('/api/v1/catalogue/import')
        .send({ csv_content: duplicateCsv, filename: 'dupes.csv' });

      expect(res.status).toBe(200);
      expect(res.body.duplicate_rows).toBeGreaterThanOrEqual(1);
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.errors.some((e: any) => e.error.includes('Duplicate'))).toBe(true);
    });

    it('provides row-wise error reports with row numbers and exact reasons for invalid rows', async () => {
      const invalidCsv = `name,url,platform_key,connector_key,category,audience_tags,est_audience,language
,https://valid-url.com,discourse,discourse,software,dev,1000,en
Invalid Url Forum,not-a-valid-http-url,discourse,discourse,software,dev,1000,en
Missing URL Name,,discourse,discourse,software,dev,1000,en`;

      const res = await request(app)
        .post('/api/v1/catalogue/import')
        .send({ csv_content: invalidCsv, filename: 'invalids.csv' });

      expect(res.status).toBe(200);
      expect(res.body.invalid_rows).toBe(3);
      expect(res.body.errors).toHaveLength(3);

      // Row numbers corresponding to CSV lines (header is row 1)
      expect(res.body.errors[0].row).toBe(2);
      expect(res.body.errors[0].error).toContain('Missing required field');

      expect(res.body.errors[1].row).toBe(3);
      expect(res.body.errors[1].error).toContain('Malformed URL');

      expect(res.body.errors[2].row).toBe(4);
      expect(res.body.errors[2].error).toContain('Missing required field');
    });

    it('supports importing raw CSV text with text/plain Content-Type and returns row_results', async () => {
      const rawCsv = `name,url,platform_key,category
Raw Body Destination,https://rawbody.example.com,discourse,software`;

      const res = await request(app)
        .post('/api/v1/catalogue/import')
        .set('Content-Type', 'text/plain')
        .send(rawCsv);

      expect(res.status).toBe(200);
      expect(res.body.total_rows).toBe(1);
      expect(res.body.valid_rows).toBe(1);
      expect(res.body.row_results).toHaveLength(1);
      expect(res.body.row_results[0].status).toBe('imported');
      expect(res.body.row_results[0].name).toBe('Raw Body Destination');
    });

    it('rejects CSV with missing required headers and returns header error on row 1', async () => {
      const badHeaderCsv = `invalid_col1,invalid_col2
val1,val2`;

      const res = await request(app)
        .post('/api/v1/catalogue/import')
        .send({ csv_content: badHeaderCsv, filename: 'bad_headers.csv' });

      expect(res.status).toBe(200);
      expect(res.body.valid_rows).toBe(0);
      expect(res.body.row_errors).toHaveLength(1);
      expect(res.body.row_errors[0].row_number).toBe(1);
      expect(res.body.row_errors[0].field).toBe('headers');
    });
  });
});
