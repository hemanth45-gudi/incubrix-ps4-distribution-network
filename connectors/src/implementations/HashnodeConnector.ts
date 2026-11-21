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

export class HashnodeConnector extends BaseConnector {
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

    const rawBase = this.getBaseUrl(req);
    const baseUrl = rawBase.endsWith('/mock/hashnode') ? rawBase : `${rawBase}/mock/hashnode`;
    const apiKey = req.connection.api_key || req.connection.token;

    const payload = {
      title: req.rendition.title || 'Hashnode Publication',
      contentMarkdown: req.rendition.body,
      tags: req.rendition.tags || ['developer', 'tech'],
      canonicalUrl: req.rendition.canonical_url,
    };

    try {
      const res = await fetch(`${baseUrl}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey || ''}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        const errBody = await res.json().catch(() => ({}));
        throw new ConnectorError(
          errCode,
          `Hashnode API responded with HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const postId = String(data.id || 'hashnode-1');
      const liveUrl = data.url || `${baseUrl}/p/${postId}`;

      return {
        platform_post_id: postId,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Hashnode publish failed: ${err.message}`, true, 503);
    }
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const rawBase = (req.connection.base_url || (req as any).destination?.url || 'http://localhost:3001').replace(/\/+$/, '');
    const baseUrl = rawBase.endsWith('/mock/hashnode') ? rawBase : `${rawBase}/mock/hashnode`;
    try {
      const res = await fetch(`${baseUrl}/posts/${req.platform_post_id}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 'deleted', live_url: '' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Hashnode getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      const data = (await res.json()) as any;
      return {
        status: data.deleted ? 'deleted' : 'published',
        live_url: data.url || `${baseUrl}/p/${req.platform_post_id}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get Hashnode post status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const rawBase = (req.connection.base_url || (req as any).destination?.url || 'http://localhost:3001').replace(/\/+$/, '');
    const baseUrl = rawBase.endsWith('/mock/hashnode') ? rawBase : `${rawBase}/mock/hashnode`;
    const apiKey = req.connection.api_key;

    try {
      const res = await fetch(`${baseUrl}/posts/${req.platform_post_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey || ''}`,
        },
      });

      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Hashnode delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete Hashnode post: ${err.message}`, true);
    }
  }

  async fetchMetrics(req: MetricsRequest): Promise<MetricsResult> {
    return {
      views: 410,
      likes: 38,
      comments: 9,
      shares: 14,
      clicks: 22,
    };
  }
}
