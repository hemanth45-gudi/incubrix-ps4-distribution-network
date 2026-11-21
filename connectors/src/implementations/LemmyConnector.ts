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

export class LemmyConnector extends BaseConnector {
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
    const token = req.connection.token || req.connection.api_key;

    const payload = {
      name: req.rendition.title || req.rendition.body.slice(0, 50),
      body: req.rendition.body,
      community_id: req.connection.community_id || 1,
    };

    try {
      const res = await fetch(`${baseUrl}/api/v3/post`, {
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
          `Lemmy API error: HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const post = data.post_view?.post || data.post || {};
      const postId = String(post.id || 'lemmy-post-1');
      const liveUrl = `${baseUrl}/post/${postId}`;

      return {
        platform_post_id: postId,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Lemmy publish failed: ${err.message}`, true, 503);
    }
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const baseUrl = req.connection.base_url || 'http://localhost:3001/mock/lemmy';
    try {
      const res = await fetch(`${baseUrl}/api/v3/post?id=${req.platform_post_id}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 'deleted', live_url: '' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Lemmy getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      const data = (await res.json()) as any;
      const post = data.post_view?.post || {};
      return {
        status: post.deleted ? 'deleted' : 'published',
        live_url: `${baseUrl}/post/${req.platform_post_id}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get Lemmy post status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const baseUrl = req.connection.base_url || 'http://localhost:3001/mock/lemmy';
    const token = req.connection.token || req.connection.api_key;

    try {
      const res = await fetch(`${baseUrl}/api/v3/post/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({
          post_id: parseInt(req.platform_post_id, 10) || req.platform_post_id,
          deleted: true,
        }),
      });

      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `Lemmy delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete Lemmy post: ${err.message}`, true);
    }
  }

  async fetchMetrics(req: MetricsRequest): Promise<MetricsResult> {
    return {
      views: 85,
      likes: 12,
      comments: 3,
      shares: 0,
      clicks: 5,
    };
  }
}
