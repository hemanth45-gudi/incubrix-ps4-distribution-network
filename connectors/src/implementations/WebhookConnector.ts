import crypto from 'crypto';
import { BaseConnector } from '../base.js';
import {
  ConnectorManifest,
  PublishRequest,
  PublishResult,
  StatusRequest,
  StatusResult,
  DeleteRequest,
  DeleteResult,
} from '../types.js';
import { ConnectorError, mapPlatformStatusToErrorCode } from '../errors.js';

export class WebhookConnector extends BaseConnector {
  constructor(manifest: ConnectorManifest) {
    super(manifest);
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const validation = await this.validate(req);
    if (!validation.ok) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        `Validation failed: ${validation.violations.map((v) => v.message).join('; ')}`,
        false,
        422,
        { violations: validation.violations }
      );
    }

    const webhookUrl = req.connection.webhook_url || req.destination.url;
    const secret = req.connection.secret || 'mock-webhook-secret-32-bytes-long!';
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const payload = {
      event: 'content.publish',
      idempotency_key: req.idempotency_key,
      rendition: req.rendition,
      destination: { id: req.destination.id, name: req.destination.name },
      timestamp,
    };

    // Generate HMAC-SHA256 signature
    const signaturePayload = `${timestamp}.${JSON.stringify(payload)}`;
    const signature = crypto.createHmac('sha256', secret).update(signaturePayload).digest('hex');

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-IncuBrix-Signature': signature,
          'X-IncuBrix-Timestamp': timestamp,
          'X-IncuBrix-Event': 'publish',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        const errBody = await res.json().catch(() => ({}));
        throw new ConnectorError(
          errCode,
          `Webhook destination responded with HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const eventId = data.event_id || `wh_${Date.now()}`;
      const liveUrl = data.live_url || `${webhookUrl}/events/${eventId}`;

      return {
        platform_post_id: eventId,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Webhook delivery failed: ${err.message}`, true, 503);
    }
  }

  private resolveBaseUrl(req: { connection: { webhook_url?: string; base_url?: string }; destination?: { url: string } }): string {
    const target = req.connection.webhook_url || req.connection.base_url || req.destination?.url;
    if (target) {
      try {
        return new URL(target).origin;
      } catch {
        return target.replace(/\/+$/, '');
      }
    }
    return 'http://localhost:3001';
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const baseUrl = this.resolveBaseUrl(req);
    try {
      const res = await fetch(`${baseUrl}/mock/webhook/events/${req.platform_post_id}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 'deleted', live_url: '' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Webhook getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      return {
        status: 'published',
        live_url: `${baseUrl}/events/${req.platform_post_id}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get webhook status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const baseUrl = this.resolveBaseUrl(req);
    try {
      const res = await fetch(`${baseUrl}/mock/webhook/events/${req.platform_post_id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Webhook delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete webhook event: ${err.message}`, true);
    }
  }
}
