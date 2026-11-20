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

export class SlackConnector extends BaseConnector {
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
    const token = req.connection.token || req.connection.api_key;

    const payload = {
      text: req.rendition.title ? `*${req.rendition.title}*\n${req.rendition.body}` : req.rendition.body,
      channel: req.connection.channel || '#announcements',
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        const errBody = await res.json().catch(() => ({}));
        throw new ConnectorError(
          errCode,
          `Slack API responded with HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const ts = data.ts || `msg_${Date.now()}`;
      const liveUrl = data.url || `${webhookUrl}/archives/${ts}`;

      return {
        platform_post_id: ts,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Slack publish failed: ${err.message}`, true, 503);
    }
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const baseUrl = req.connection.webhook_url ? new URL(req.connection.webhook_url).origin : 'http://localhost:3001';
    try {
      const res = await fetch(`${baseUrl}/mock/slack/messages/${req.platform_post_id}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 'deleted', live_url: '' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Slack getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      return {
        status: 'published',
        live_url: `${baseUrl}/mock/slack/archives/${req.platform_post_id}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get Slack message status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const baseUrl = req.connection.webhook_url ? new URL(req.connection.webhook_url).origin : 'http://localhost:3001';
    try {
      const res = await fetch(`${baseUrl}/mock/slack/messages/${req.platform_post_id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Slack delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete Slack message: ${err.message}`, true);
    }
  }
}
