import crypto from 'crypto';
import { connectorRegistry, ContentRendition, ConnectionCredentials, PublishResult } from '@incubrix/connectors';
import { dbRepository, PublicationRecord } from '../database/repository.js';
import { rulesEngine } from '../rules/rulesEngine.js';
import { idempotencyService } from './idempotency.js';
import { generateOutputManifest, OutputManifest } from '../utils/manifestGenerator.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface PublishParams {
  destination_id: string;
  rendition: ContentRendition;
  connection?: ConnectionCredentials;
  idempotency_key: string;
  is_test?: boolean;
  callback_url?: string;
}

export interface PublishOutcome {
  publication: PublicationRecord;
  publish_result: PublishResult;
  manifest: OutputManifest;
}

export class PublishingService {
  async publishContent(params: PublishParams): Promise<PublishOutcome> {
    const startedAt = Date.now();
    const { destination_id, rendition, connection = {}, idempotency_key, is_test = false, callback_url } = params;

    if (!idempotency_key) {
      throw new AppError('DEST_SPEC_VIOLATION', 'Missing required Idempotency-Key header', false, 400);
    }

    // 1. Destination verification
    const destination = await dbRepository.getDestinationById(destination_id);
    if (!destination) {
      throw new AppError('DEST_SPEC_VIOLATION', `Destination '${destination_id}' not found in catalogue`, false, 404);
    }

    if (destination.status !== 'active') {
      throw new AppError('CONNECTOR_DISABLED', `Destination '${destination.name}' is currently ${destination.status}`, false, 403);
    }

    // 2. Idempotency Check
    const idempotencyPayload = {
      destination_id,
      rendition,
      connection,
    };

    const cachedOutcome = idempotencyService.check(idempotency_key, idempotencyPayload);
    if (cachedOutcome) {
      logger.info(`Idempotency hit for key: ${idempotency_key} on destination: ${destination_id}`);
      return cachedOutcome;
    }

    // 3. Central Posting Rules Evaluation
    const ruleEvaluation = await rulesEngine.evaluate(rendition, destination);
    if (!ruleEvaluation.passed) {
      const primaryReason = ruleEvaluation.reasons.join('; ');

      if (ruleEvaluation.action === 'reschedule') {
        throw new AppError(
          'DEST_RULE_FREQUENCY_CAP',
          `Publication blocked by frequency cap: ${primaryReason}`,
          true,
          429,
          { reasons: ruleEvaluation.reasons, decisions: ruleEvaluation.decisions }
        );
      }

      if (ruleEvaluation.action === 'route_assisted') {
        throw new AppError(
          'DEST_SPEC_VIOLATION',
          `Automated publishing blocked: ${primaryReason}. Use assisted connector instead.`,
          false,
          400,
          { reasons: ruleEvaluation.reasons, action: 'route_assisted' }
        );
      }

      throw new AppError(
        'DEST_SPEC_VIOLATION',
        `Publication blocked by community posting rule: ${primaryReason}`,
        false,
        422,
        { reasons: ruleEvaluation.reasons, decisions: ruleEvaluation.decisions }
      );
    }

    // 4. Connector Lookup
    const connectorKey = destination.connector_key;
    const connector = connectorRegistry.get(connectorKey);

    // Provide default mock credentials in simulation mode or for mock routes when none provided
    const effectiveConnection = { ...connection };
    if (config.SIMULATION_MODE || destination.url.includes('/mock/')) {
      if (!effectiveConnection.api_key && !effectiveConnection.token && !effectiveConnection.access_token) {
        effectiveConnection.api_key = 'mock_api_key';
        effectiveConnection.token = 'mock_token';
        effectiveConnection.access_token = 'mock_access_token';
        effectiveConnection.username = effectiveConnection.username || 'mock_user';
        effectiveConnection.secret = effectiveConnection.secret || 'mock-webhook-secret-32-bytes-long!';
      }
    }

    // 5. Connector Spec Validation
    const validation = await connector.validate({
      rendition,
      destination,
      connection: effectiveConnection,
    });

    if (!validation.ok) {
      throw new AppError(
        'DEST_SPEC_VIOLATION',
        `Content spec validation failed: ${validation.violations.map((v) => v.message).join('; ')}`,
        false,
        422,
        { violations: validation.violations }
      );
    }

    // 6. Execute Outbound Publication via Connector
    let publishResult: PublishResult;
    const isMockOrLocal = destination.url.includes('localhost') || destination.url.includes('127.0.0.1') || destination.url.includes('/mock/');
    const hasExplicitAuth = Boolean(connection.api_key || connection.token || connection.access_token);

    if (config.SIMULATION_MODE && !isMockOrLocal && !hasExplicitAuth) {
      publishResult = {
        platform_post_id: `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        live_url: `${destination.url.replace(/\/+$/, '')}/p/simulated-${Date.now()}`,
        status: 'published',
      };
      logger.info(`[SIMULATION MODE] Simulated publication generated for destination '${destination.name}' (${destination_id})`);
    } else {
      publishResult = await connector.publish({
        rendition,
        destination,
        connection: effectiveConnection,
        idempotency_key,
      });
    }

    // 7. Persist Publication Record in Repository
    const publication = await dbRepository.createPublication({
      destination_id,
      connector_key: connectorKey,
      idempotency_key,
      status: publishResult.status,
      title: rendition.title,
      body: rendition.body,
      live_url: publishResult.live_url,
      platform_post_id: publishResult.platform_post_id,
      is_test,
    });

    // 8. Generate Output Manifest
    const manifest = generateOutputManifest({
      connector_key: connectorKey,
      destination_id,
      started_at: startedAt,
      is_ai_generated: rendition.is_ai_generated,
      warnings: ruleEvaluation.reasons,
    });

    const outcome: PublishOutcome = {
      publication,
      publish_result: publishResult,
      manifest,
    };

    // Store in idempotency engine
    idempotencyService.store(idempotency_key, idempotencyPayload, outcome);

    // 9. Fire HMAC Signed Callback if requested
    if (callback_url) {
      this.sendHmacCallback(callback_url, outcome).catch((err) => {
        logger.warn(`HMAC Callback failed: ${err.message}`, { details: { callback_url } });
      });
    }

    return outcome;
  }

  private async sendHmacCallback(callbackUrl: string, payload: any): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.WEBHOOK_DEFAULT_SECRET || 'mock-webhook-secret-32-bytes-long!';
    const rawPayload = `${timestamp}.${JSON.stringify(payload)}`;
    const signature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-IncuBrix-Signature': signature,
        'X-IncuBrix-Timestamp': timestamp,
      },
      body: JSON.stringify(payload),
    });
  }
}

export const publishingService = new PublishingService();
