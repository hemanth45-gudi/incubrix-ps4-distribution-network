import { Router, Request, Response } from 'express';
import { connectorRegistry, ConnectorError } from '@incubrix/connectors';
import { idempotencyService } from '../services/idempotency.js';
import { logger } from '../utils/logger.js';

export const connectorRouter = Router();

// Helper to resolve connector or throw standardized error
function getConnector(key: string) {
  return connectorRegistry.get(key);
}

/**
 * POST /connector/v1/:connector_key/validate
 */
connectorRouter.post('/connector/v1/:connector_key/validate', async (req: Request, res: Response, next) => {
  try {
    const connector = getConnector(req.params.connector_key);
    let { rendition, destination, connection } = req.body;

    if (!rendition && (req.body.body || req.body.title)) {
      rendition = {
        title: req.body.title || 'Validation Post',
        body: req.body.body || '',
        tags: req.body.tags || [],
      };
    }
    if (!destination && (req.body.destination_url || req.body.url)) {
      destination = {
        id: req.body.destination_id || `dest-${req.params.connector_key}-val`,
        name: req.body.destination_name || 'Validation Dest',
        url: req.body.destination_url || req.body.url || 'https://example.com',
        connector_key: req.params.connector_key,
        platform_key: req.params.connector_key,
      };
    }
    if (!connection) {
      connection = {
        api_key: req.body.api_key || 'test_key',
        token: req.body.token || 'test_token',
        secret: req.body.secret || 'mock-webhook-secret-32-bytes-long!',
      };
    }

    if (!rendition || !destination) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        'Request body must contain rendition and destination objects',
        false,
        400
      );
    }

    const result = await connector.validate({
      rendition,
      destination,
      connection: connection || {},
    });

    return res.status(200).json({
      ...result,
      valid: result.ok,
      message: result.ok ? 'Validation passed' : result.violations.map((v) => v.message).join('; '),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /connector/v1/:connector_key/publish
 * Requires Idempotency-Key header
 */
connectorRouter.post('/connector/v1/:connector_key/publish', async (req: Request, res: Response, next) => {
  try {
    const connectorKey = req.params.connector_key;
    const connector = getConnector(connectorKey);

    const idempotencyKey =
      (req.header('Idempotency-Key') || req.header('idempotency-key') || req.body.idempotency_key) as string;

    if (!idempotencyKey) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        'Missing required header: Idempotency-Key',
        false,
        400
      );
    }

    const { rendition, destination, connection } = req.body;
    if (!rendition || !destination) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        'Request body must contain rendition and destination objects',
        false,
        400
      );
    }

    // Prepare payload for idempotency checking (excluding unstable keys)
    const idempotencyPayload = {
      connectorKey,
      rendition,
      destination,
      connection: connection || {},
    };

    // Check existing idempotency record
    const cachedResponse = idempotencyService.check(idempotencyKey, idempotencyPayload);
    if (cachedResponse) {
      logger.info(`Idempotent hit for key: ${idempotencyKey} (returning cached post)`, {
        correlation_id: req.correlationId,
        connector_key: connectorKey,
        destination_id: destination.id,
      });
      return res.status(200).json(cachedResponse);
    }

    // Execute publication via connector
    const result = await connector.publish({
      rendition,
      destination,
      connection: connection || {},
      idempotency_key: idempotencyKey,
    });

    // Store successful result in idempotency cache
    idempotencyService.store(idempotencyKey, idempotencyPayload, result);

    logger.info(`Published content via connector ${connectorKey}: post_id=${result.platform_post_id}`, {
      correlation_id: req.correlationId,
      connector_key: connectorKey,
      destination_id: destination.id,
      details: {
        live_url: result.live_url,
        status: result.status,
      },
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /connector/v1/:connector_key/get_status
 */
connectorRouter.post('/connector/v1/:connector_key/get_status', async (req: Request, res: Response, next) => {
  try {
    const connector = getConnector(req.params.connector_key);
    const { platform_post_id, connection } = req.body;

    if (!platform_post_id) {
      throw new ConnectorError('DEST_SPEC_VIOLATION', 'Missing required parameter: platform_post_id', false, 400);
    }

    const result = await connector.getStatus({
      platform_post_id: String(platform_post_id),
      connection: connection || {},
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /connector/v1/:connector_key/delete
 */
connectorRouter.post('/connector/v1/:connector_key/delete', async (req: Request, res: Response, next) => {
  try {
    const connector = getConnector(req.params.connector_key);
    const { platform_post_id, connection } = req.body;

    if (!platform_post_id) {
      throw new ConnectorError('DEST_SPEC_VIOLATION', 'Missing required parameter: platform_post_id', false, 400);
    }

    const result = await connector.delete({
      platform_post_id: String(platform_post_id),
      connection: connection || {},
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /connector/v1/:connector_key/fetch_metrics (optional)
 */
connectorRouter.post('/connector/v1/:connector_key/fetch_metrics', async (req: Request, res: Response, next) => {
  try {
    const connector = getConnector(req.params.connector_key);
    if (!connector.fetchMetrics) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        `Connector '${req.params.connector_key}' does not support fetchMetrics`,
        false,
        400
      );
    }

    const { platform_post_id, connection, since } = req.body;
    const result = await connector.fetchMetrics({
      platform_post_id: String(platform_post_id),
      connection: connection || {},
      since,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /connector/v1/assisted/build_assist_pack & /connector/v1/:connector_key/build_assist_pack
 */
connectorRouter.post(
  ['/connector/v1/assisted/build_assist_pack', '/connector/v1/:connector_key/build_assist_pack'],
  async (req: Request, res: Response, next) => {
    try {
      const key = req.params.connector_key || 'assisted';
      const connector = getConnector(key);

      if (!connector.buildAssistPack) {
        throw new ConnectorError(
          'DEST_SPEC_VIOLATION',
          `Connector '${key}' does not support buildAssistPack`,
          false,
          400
        );
      }

      const { rendition, destination } = req.body;
      if (!rendition || !destination) {
        throw new ConnectorError(
          'DEST_SPEC_VIOLATION',
          'Request body must contain rendition and destination objects',
          false,
          400
        );
      }

      const result = await connector.buildAssistPack({ rendition, destination });
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);
