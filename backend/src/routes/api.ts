import { Router, Request, Response } from 'express';
import { dbRepository } from '../database/repository.js';
import { publishingService } from '../services/publishingService.js';
import { rulesEngine } from '../rules/rulesEngine.js';
import { jobManager } from '../jobs/jobManager.js';
import { storageService } from '../storage/storageService.js';
import { connectorRegistry } from '@incubrix/connectors';
import { AppError } from '../middleware/errorHandler.js';
import { csvCatalogueImporter } from '../catalogue/csvImporter.js';
import { aiRuleCaptureService } from '../rules/aiRuleCapture.js';
import { contentTailorer } from '../tailoring/contentTailorer.js';
import { destinationRecommender } from '../recommender/destinationRecommender.js';
import { recertificationService } from '../certification/recertificationService.js';
import { generateDeterministicMetrics } from '../services/metricsService.js';

export const apiV1Router = Router();

// ==========================================
// 1. JOBS
// ==========================================
apiV1Router.get('/api/v1/jobs/:job_id', async (req: Request, res: Response, next) => {
  try {
    const job = await jobManager.getJobStatus(req.params.job_id);
    if (!job) {
      throw new AppError('NOT_FOUND', `Job '${req.params.job_id}' not found`, false, 404);
    }
    return res.status(200).json({
      job_id: job.id,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. DESTINATIONS
// ==========================================
apiV1Router.get('/api/v1/destinations', async (req: Request, res: Response, next) => {
  try {
    const filter = {
      platform_key: req.query.platform_key as string,
      status: req.query.status as string,
      category: req.query.category as string,
      search: req.query.search as string,
    };
    const list = await dbRepository.listDestinations(filter);
    return res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/destinations', async (req: Request, res: Response, next) => {
  try {
    const idempotencyKey = (req.header('Idempotency-Key') || req.body.idempotency_key || `dest-key-${Date.now()}`) as string;
    const { name, url, platform_key } = req.body;
    if (!name || !url) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Fields name and url are required for destination creation', false, 400);
    }
    const created = await dbRepository.createDestination({
      ...req.body,
      platform_key: platform_key || 'discourse',
      connector_key: req.body.connector_key || platform_key || 'discourse',
    });
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/destinations/:id', async (req: Request, res: Response, next) => {
  try {
    const dest = await dbRepository.getDestinationById(req.params.id);
    if (!dest) {
      throw new AppError('NOT_FOUND', `Destination '${req.params.id}' not found`, false, 404);
    }
    return res.status(200).json(dest);
  } catch (err) {
    next(err);
  }
});

apiV1Router.patch('/api/v1/destinations/:id', async (req: Request, res: Response, next) => {
  try {
    const updated = await dbRepository.updateDestination(req.params.id, req.body);
    if (!updated) {
      throw new AppError('NOT_FOUND', `Destination '${req.params.id}' not found`, false, 404);
    }
    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

apiV1Router.delete('/api/v1/destinations/:id', async (req: Request, res: Response, next) => {
  try {
    const deleted = await dbRepository.deleteDestination(req.params.id);
    return res.status(200).json({ deleted });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. PUBLISHING WORKFLOW
// ==========================================
apiV1Router.post('/api/v1/publish', async (req: Request, res: Response, next) => {
  try {
    const idempotencyKey = (req.header('Idempotency-Key') || req.body.idempotency_key) as string;
    if (!idempotencyKey) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Missing required Idempotency-Key header', false, 400);
    }

    const destination_id = req.body.destination_id;
    const rendition = req.body.rendition || (req.body.body !== undefined ? {
      title: req.body.title,
      body: req.body.body,
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      canonical_url: req.body.canonical_url,
    } : undefined);
    const connection = req.body.connection;
    const runAsync = req.body.async;
    const callback_url = req.body.callback_url;

    if (!destination_id || !rendition) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Fields destination_id and rendition are required', false, 400);
    }

    // If requested async or operation involves heavy processing -> return 202 with job_id
    if (runAsync) {
      const job = await jobManager.enqueue({
        job_type: 'publication_workflow',
        payload: req.body,
        callback_url,
        executor: async (updateProgress) => {
          await updateProgress(25);
          const outcome = await publishingService.publishContent({
            destination_id,
            rendition,
            connection,
            idempotency_key: idempotencyKey,
            callback_url,
          });
          await updateProgress(100);
          return outcome;
        },
      });

      return res.status(202).json({
        job_id: job.id,
        status: 'queued',
        progress: 0,
        result: null,
      });
    }

    // Synchronous execution
    const outcome = await publishingService.publishContent({
      destination_id,
      rendition,
      connection,
      idempotency_key: idempotencyKey,
      callback_url,
    });

    return res.status(200).json(outcome);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/publications', async (req: Request, res: Response, next) => {
  try {
    const destinationId = req.query.destination_id as string;
    const list = await dbRepository.listPublications(destinationId);
    return res.status(200).json(list);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/publications/:id', async (req: Request, res: Response, next) => {
  try {
    const pub = await dbRepository.getPublicationById(req.params.id);
    if (!pub) {
      throw new AppError('NOT_FOUND', `Publication '${req.params.id}' not found`, false, 404);
    }
    return res.status(200).json(pub);
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/publications/:id/delete', async (req: Request, res: Response, next) => {
  try {
    const pub = await dbRepository.getPublicationById(req.params.id);
    if (!pub) {
      throw new AppError('NOT_FOUND', `Publication '${req.params.id}' not found`, false, 404);
    }

    const connector = connectorRegistry.get(pub.connector_key);
    const dest = await dbRepository.getDestinationById(pub.destination_id);

    if (pub.platform_post_id) {
      await connector.delete({
        platform_post_id: pub.platform_post_id,
        connection: req.body.connection || { base_url: dest?.url },
      });
    }

    await dbRepository.updatePublicationStatus(pub.id, 'deleted');

    return res.status(200).json({
      publication_id: pub.id,
      deleted: true,
      status: 'deleted',
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. RULES
// ==========================================
apiV1Router.get('/api/v1/destinations/:id/rules', async (req: Request, res: Response, next) => {
  try {
    const dest = await dbRepository.getDestinationById(req.params.id);
    if (!dest) {
      throw new AppError('NOT_FOUND', `Destination '${req.params.id}' not found`, false, 404);
    }
    const decisions = await dbRepository.getRuleDecisions(req.params.id);
    return res.status(200).json({
      destination_id: dest.id,
      frequency_cap: dest.frequency_cap,
      self_promo_allowed: dest.self_promo_allowed,
      link_policy: dest.link_policy,
      disclosure_required: dest.disclosure_required,
      automation_allowed: dest.automation_allowed,
      recent_decisions: decisions,
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.put('/api/v1/destinations/:id/rules', async (req: Request, res: Response, next) => {
  try {
    const { frequency_cap, self_promo_allowed, link_policy, disclosure_required, automation_allowed } = req.body;
    const updated = await dbRepository.updateDestination(req.params.id, {
      frequency_cap,
      self_promo_allowed,
      link_policy,
      disclosure_required,
      automation_allowed,
    });
    if (!updated) {
      throw new AppError('NOT_FOUND', `Destination '${req.params.id}' not found`, false, 404);
    }
    return res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/rules/evaluate', async (req: Request, res: Response, next) => {
  try {
    const { destination_id } = req.body;
    let rendition = req.body.rendition;

    if (!rendition && (req.body.body || req.body.title)) {
      rendition = {
        title: req.body.title || '',
        body: req.body.body || '',
        tags: req.body.tags || [],
        canonical_url: req.body.canonical_url,
        is_ai_generated: req.body.is_ai_generated,
        ai_disclosure: req.body.ai_disclosure,
      };
    }

    if (!destination_id || !rendition) {
      throw new AppError('DEST_SPEC_VIOLATION', 'destination_id and rendition are required', false, 400);
    }
    const dest = await dbRepository.getDestinationById(destination_id);
    if (!dest) {
      throw new AppError('NOT_FOUND', `Destination '${destination_id}' not found`, false, 404);
    }
    const result = await rulesEngine.evaluate(rendition, dest);
    return res.status(200).json({
      ...result,
      verdict: result.passed ? 'pass' : (result.action === 'reschedule' ? 'reschedule' : 'block'),
      rules_matched: result.decisions.length,
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. METRICS & ASSISTED
// ==========================================
apiV1Router.get('/api/v1/metrics/:publication_id', async (req: Request, res: Response, next) => {
  try {
    const pub = await dbRepository.getPublicationById(req.params.publication_id);
    if (!pub) {
      throw new AppError('NOT_FOUND', `Publication '${req.params.publication_id}' not found`, false, 404);
    }

    // 1. Check if metrics are already stored for this publication
    let stored = await dbRepository.getPublicationMetrics(pub.id);

    if (!stored) {
      // 2. Generate separate deterministic metrics based on publication ID
      const generated = generateDeterministicMetrics(pub.id);
      stored = await dbRepository.savePublicationMetrics({
        publication_id: pub.id,
        ...generated,
      });
    }

    return res.status(200).json({
      publication_id: pub.id,
      views: stored.views,
      likes: stored.likes,
      comments: stored.comments,
      shares: stored.shares,
      clicks: stored.clicks,
      saves: stored.saves ?? 0,
      watch_time_s: stored.watch_time_s ?? 0,
      collected_at: stored.collected_at.toISOString(),
      fetched_at: stored.collected_at.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/assisted/build-pack', async (req: Request, res: Response, next) => {
  try {
    const { destination_id, rendition } = req.body;
    const dest = await dbRepository.getDestinationById(destination_id);
    if (!dest) {
      throw new AppError('NOT_FOUND', `Destination '${destination_id}' not found`, false, 404);
    }
    const assisted = connectorRegistry.get('assisted');
    if (!assisted.buildAssistPack) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Assisted connector missing buildAssistPack capability', false, 500);
    }
    const pack = await assisted.buildAssistPack({ rendition, destination: dest as any });
    return res.status(200).json(pack);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 6. STORAGE (MinIO / Local Fallback)
// ==========================================
apiV1Router.post('/api/v1/storage/upload', async (req: Request, res: Response, next) => {
  try {
    const { filename, content, mime_type, url } = req.body;

    if (url) {
      storageService.validateSafeUrl(url);
      const fetched = await fetch(url);
      if (!fetched.ok) {
        throw new AppError('PLATFORM_UNAVAILABLE', `Failed to fetch URL: HTTP ${fetched.status}`, true, 400);
      }
      const buffer = Buffer.from(await fetched.arrayBuffer());
      const stored = await storageService.storeFile(filename || 'downloaded_asset', buffer, mime_type || 'image/jpeg');
      return res.status(201).json(stored);
    }

    if (!content) {
      throw new AppError('DEST_SPEC_VIOLATION', 'File content or valid url must be provided', false, 400);
    }

    const stored = await storageService.storeFile(filename || 'uploaded_file', content, mime_type || 'text/plain');
    return res.status(201).json(stored);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/storage/:id', async (req: Request, res: Response, next) => {
  try {
    const file = await storageService.getFile(req.params.id);
    if (!file) {
      throw new AppError('NOT_FOUND', `File '${req.params.id}' not found`, false, 404);
    }
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.send(file.buffer);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 7. CATALOGUE IMPORT (CSV)
// ==========================================
const importHistory: any[] = [];

apiV1Router.post('/api/v1/catalogue/import', async (req: Request, res: Response, next) => {
  try {
    const csvContent = typeof req.body === 'string' ? req.body : req.body.csv_content || req.body.csv;
    const filename = req.body.filename || 'catalogue.csv';

    if (!csvContent || typeof csvContent !== 'string') {
      throw new AppError('DEST_SPEC_VIOLATION', 'CSV content must be provided in request body', false, 400);
    }

    const result = await csvCatalogueImporter.importCsv(csvContent, filename);
    const now = new Date();
    const formattedErrors = (result.row_errors || []).map((re) => ({
      row: re.row_number,
      error: re.reason,
      url: re.url,
      field: re.field,
    }));

    importHistory.unshift({
      id: result.import_id,
      import_id: result.import_id,
      filename: result.filename,
      total_rows: result.total_rows,
      valid_rows: result.valid_rows,
      duplicate_rows: result.duplicate_rows,
      invalid_rows: result.invalid_rows,
      duration_ms: result.duration_ms,
      imported_at: now,
      created_at: now.toISOString(),
      errors: formattedErrors,
      row_results: result.row_results,
    });

    return res.status(200).json({
      ...result,
      errors: formattedErrors,
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/catalogue/imports', async (_req: Request, res: Response, next) => {
  try {
    return res.status(200).json(importHistory);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 8. AI-ASSISTED RULES CAPTURE
// ==========================================
apiV1Router.post('/api/v1/rules/capture', async (req: Request, res: Response, next) => {
  try {
    const source_text = req.body.source_text || req.body.policy_text;
    const { source_url, destination_id } = req.body;
    if (!source_text && !source_url) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Either source_text (or policy_text) or source_url is required', false, 400);
    }

    const draft = await aiRuleCaptureService.captureRules({
      source_text,
      source_url,
      destination_id,
    });

    const ex = draft.extracted_rules;
    const draftRules = [
      {
        id: `${draft.draft_id}-fc`,
        rule_text: `Frequency Cap: Maximum ${ex.frequency_cap.max_posts} post(s) per ${ex.frequency_cap.window_days} day(s)`,
        confidence: ex.confidence,
        evidence: ex.evidence.find((e) => e.includes('posting frequency') || e.includes('rate limit')) || ex.evidence[0] || 'Extracted frequency limit',
      },
      {
        id: `${draft.draft_id}-sp`,
        rule_text: `Self-Promotion Policy: ${ex.self_promo_allowed ? 'Permitted' : 'Strictly prohibited / ratio enforced'}`,
        confidence: ex.confidence,
        evidence: ex.evidence.find((e) => e.includes('self-promotion') || e.includes('promoting')) || 'Self promotion policy',
      },
      {
        id: `${draft.draft_id}-lp`,
        rule_text: `Link Policy: ${ex.link_policy.replace('_', ' ').toUpperCase()}`,
        confidence: ex.confidence,
        evidence: ex.evidence.find((e) => e.includes('link') || e.includes('hyperlink')) || 'External link policy',
      },
      {
        id: `${draft.draft_id}-ai`,
        rule_text: `AI Disclosure: ${ex.disclosure_required ? 'Required for all AI-generated content' : 'Not explicitly required'}`,
        confidence: ex.confidence,
        evidence: ex.evidence.find((e) => e.includes('AI') || e.includes('artificial')) || 'AI disclosure policy',
      },
      {
        id: `${draft.draft_id}-auto`,
        rule_text: `Automation: ${ex.automation_allowed ? 'Automated API publishing allowed' : 'Prohibited: manual submission only'}`,
        confidence: ex.confidence,
        evidence: ex.evidence.find((e) => e.includes('bot') || e.includes('automated')) || 'Bot / automation guidelines',
      },
    ];

    return res.status(201).json({
      ...draft,
      capture_id: draft.draft_id,
      draft_rules: draftRules,
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/rules/confirm', async (req: Request, res: Response, next) => {
  try {
    const draft_id = req.body.draft_id || req.body.capture_id;
    const { confirmed, reviewed_by, overrides, destination_id } = req.body;
    if (!draft_id || typeof confirmed !== 'boolean') {
      throw new AppError('DEST_SPEC_VIOLATION', 'draft_id (or capture_id) and boolean confirmed flag are required', false, 400);
    }

    const draft = aiRuleCaptureService.getDraft(draft_id);
    if (draft && destination_id && !draft.destination_id) {
      draft.destination_id = destination_id;
    }

    const result = await aiRuleCaptureService.confirmRules({
      draft_id,
      confirmed,
      reviewed_by,
      overrides,
    });

    return res.status(200).json({
      message: confirmed
        ? (result.updated_destination
          ? `Rules confirmed and applied to destination '${result.updated_destination.name}'`
          : 'Rules confirmed successfully')
        : 'Rules draft rejected',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/rules/drafts', async (_req: Request, res: Response, next) => {
  try {
    const drafts = aiRuleCaptureService.listDrafts();
    return res.status(200).json(drafts);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 9. CONTENT TAILORING
// ==========================================
apiV1Router.post('/api/v1/tailor', async (req: Request, res: Response, next) => {
  try {
    const { destination_id, content } = req.body;
    if (!destination_id || !content || !content.body) {
      throw new AppError('DEST_SPEC_VIOLATION', 'destination_id and content.body are required', false, 400);
    }

    const destination = await dbRepository.getDestinationById(destination_id);
    if (!destination) {
      throw new AppError('NOT_FOUND', `Destination '${destination_id}' not found`, false, 404);
    }

    const tailored = contentTailorer.tailor(content, destination);
    return res.status(200).json(tailored);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 10. DESTINATION RECOMMENDER & PRECISION@10
// ==========================================
apiV1Router.post('/api/v1/recommendations', async (req: Request, res: Response, next) => {
  try {
    const { title, body, tags, category, is_commercial, limit } = req.body;
    if (!body && !title) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Title or body is required for recommendation', false, 400);
    }

    const recommendations = await destinationRecommender.recommend(
      { title, body: body || '', tags, category, is_commercial },
      limit ? parseInt(String(limit), 10) : 10
    );

    return res.status(200).json({
      recommendations,
      data: recommendations,
      count: recommendations.length,
    });
  } catch (err) {
    next(err);
  }
});

apiV1Router.post('/api/v1/recommendations/evaluate', async (_req: Request, res: Response, next) => {
  try {
    const evaluation = await destinationRecommender.evaluatePrecisionAt10();
    return res.status(200).json(evaluation);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 11. DESTINATION RECERTIFICATION
// ==========================================
apiV1Router.post('/api/v1/certifications/recertify-due', async (req: Request, res: Response, next) => {
  try {
    const forceAll = req.body?.force_all === true;
    const summary = await recertificationService.recertifyDueDestinations(forceAll);
    return res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/certifications', async (_req: Request, res: Response, next) => {
  try {
    const certifications = await recertificationService.listCertifications();
    return res.status(200).json(certifications);
  } catch (err) {
    next(err);
  }
});

apiV1Router.get('/api/v1/certifications/history', async (req: Request, res: Response, next) => {
  try {
    const destinationId = req.query.destination_id as string | undefined;
    const history = await dbRepository.listCertificationRuns(destinationId);
    return res.status(200).json(history);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 12. CONNECTORS HEALTH & METADATA
// ==========================================
apiV1Router.get('/api/v1/connectors', async (_req: Request, res: Response, next) => {
  try {
    const connectors = connectorRegistry.list();
    const descriptions: Record<string, { name: string; description: string }> = {
      discourse: { name: 'Discourse', description: 'Community forum publishing via Discourse API' },
      lemmy: { name: 'Lemmy', description: 'Federated link aggregator (ActivityPub)' },
      devto: { name: 'Dev.to', description: 'Developer blog publishing platform' },
      ghost: { name: 'Ghost', description: 'Modern publishing platform CMS' },
      webhook: { name: 'Webhook', description: 'Generic HTTP webhook delivery' },
      assisted: { name: 'Assisted', description: 'Manual-assist human-in-the-loop publishing' },
      hashnode: { name: 'Hashnode', description: 'Developer blogging via Hashnode API' },
      slack: { name: 'Slack', description: 'Post messages to Slack channels' },
      peertube: { name: 'PeerTube', description: 'Federated video hosting (ActivityPub)' },
    };

    const results = await Promise.all(
      connectors.map(async (connector) => {
        let isHealthy = connector.enabled !== false;
        let message = 'Healthy and operational';

        try {
          if (!connector.enabled) {
            isHealthy = false;
            message = 'Connector is disabled';
          } else {
            // Live validation check against connector specification
            const sampleRendition = {
              title: 'Health Check Sample',
              body: 'Automated health probe verification for connector adapter.',
              tags: ['health'],
            };
            const sampleDestination = {
              id: `dest-probe-${connector.key}`,
              name: `${connector.manifest.key} Probe`,
              url: 'http://localhost:3001',
              connector_key: connector.key,
              platform_key: connector.key,
            };
            const sampleConnection = {
              api_key: 'mock_probe_key',
              token: 'mock_probe_token',
              secret: 'mock-webhook-secret-32-bytes-long!',
            };

            const val = await connector.validate({
              rendition: sampleRendition,
              destination: sampleDestination,
              connection: sampleConnection,
            });

            if (!val.ok) {
              isHealthy = false;
              message = val.violations.map((v) => v.message).join('; ');
            }
          }
        } catch (err: any) {
          isHealthy = false;
          message = err?.message || 'Connector verification failed';
        }

        const meta = descriptions[connector.key] || {
          name: connector.manifest.key.toUpperCase(),
          description: `Connector for ${connector.manifest.key}`,
        };

        return {
          key: connector.key,
          name: meta.name,
          description: meta.description,
          tier: connector.manifest.tier,
          capabilities: connector.manifest.capabilities,
          status: isHealthy ? 'Healthy' : 'Unavailable',
          message,
          enabled: connector.enabled !== false,
          version: connector.manifest.version,
          verified_at: new Date().toISOString(),
        };
      })
    );

    return res.status(200).json({ data: results });
  } catch (err) {
    next(err);
  }
});
