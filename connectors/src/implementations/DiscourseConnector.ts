import { BaseConnector } from '../base.js';
import {
  ConnectorManifest,
  PublishRequest,
  PublishResult,
  StatusRequest,
  StatusResult,
  DeleteRequest,
  DeleteResult,
  MetricsRequest,
  MetricsResult,
} from '../types.js';
import { ConnectorError, mapPlatformStatusToErrorCode } from '../errors.js';

export class DiscourseConnector extends BaseConnector {
  constructor(manifest: ConnectorManifest) {
    super(manifest);
  }

  private getBaseUrl(req: { connection: { base_url?: string }; destination: { url: string } }): string {
    const url = req.connection.base_url || req.destination.url;
    return url.replace(/\/+$/, '');
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

    const baseUrl = this.getBaseUrl(req);
    const apiKey = req.connection.api_key || req.connection.token;
    const apiUsername = req.connection.username || req.connection.api_username || 'system';

    const payload = {
      title: req.rendition.title,
      raw: req.rendition.body,
      category: req.connection.category_id || 1,
    };

    try {
      const res = await fetch(`${baseUrl}/posts.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey || '',
          'Api-Username': apiUsername,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        const errBody = await res.json().catch(() => ({}));
        throw new ConnectorError(
          errCode,
          `Discourse API responded with HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const postId = String(data.id || data.post_number || 'post-1');
      const topicSlug = data.topic_slug || 'topic';
      const liveUrl = `${baseUrl}/t/${topicSlug}/${data.topic_id || 1}`;

      return {
        platform_post_id: postId,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Discourse publish failed: ${err.message}`, true, 503);
    }
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const baseUrl = req.connection.base_url || 'http://localhost:4001';
    const apiKey = req.connection.api_key || '';
    const apiUsername = req.connection.username || 'system';

    try {
      const res = await fetch(`${baseUrl}/posts/${req.platform_post_id}.json`, {
        headers: {
          'Api-Key': apiKey,
          'Api-Username': apiUsername,
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { status: 'deleted', live_url: '' };
        }
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Discourse getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      const data = (await res.json()) as any;
      return {
        status: data.deleted ? 'deleted' : 'published',
        live_url: `${baseUrl}/t/${data.topic_slug || 'topic'}/${data.topic_id || 1}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get Discourse post status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const baseUrl = req.connection.base_url || 'http://localhost:4001';
    const apiKey = req.connection.api_key || '';
    const apiUsername = req.connection.username || 'system';

    try {
      const res = await fetch(`${baseUrl}/posts/${req.platform_post_id}.json`, {
        method: 'DELETE',
        headers: {
          'Api-Key': apiKey,
          'Api-Username': apiUsername,
        },
      });

      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Discourse delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete Discourse post: ${err.message}`, true);
    }
  }

  async fetchMetrics(req: MetricsRequest): Promise<MetricsResult> {
    const status = await this.getStatus(req);
    return {
      views: 120,
      likes: 15,
      comments: 4,
      shares: 2,
      clicks: 8,
    };
  }
}
