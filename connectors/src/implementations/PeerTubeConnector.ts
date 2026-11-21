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

export class PeerTubeConnector extends BaseConnector {
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
    const baseUrl = rawBase.endsWith('/mock/peertube') ? rawBase : `${rawBase}/mock/peertube`;
    const token = req.connection.token || req.connection.api_key || 'mock_peertube_token';

    const payload = {
      name: req.rendition.title || 'Federated Video Showcase',
      description: req.rendition.body,
      tags: req.rendition.tags || ['video', 'peertube'],
      channelId: req.connection.channelId || 1,
    };

    try {
      const res = await fetch(`${baseUrl}/api/v1/videos`, {
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
          `PeerTube API responded with HTTP ${res.status}`,
          undefined,
          res.status,
          errBody
        );
      }

      const data = (await res.json()) as any;
      const uuid = data.uuid || `pt_${Date.now()}`;
      const liveUrl = data.url || `${baseUrl}/w/${uuid}`;

      return {
        platform_post_id: uuid,
        live_url: liveUrl,
        status: 'published',
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `PeerTube publish failed: ${err.message}`, true, 503);
    }
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    const rawBase = (req.connection.base_url || (req as any).destination?.url || 'http://localhost:3001').replace(/\/+$/, '');
    const baseUrl = rawBase.endsWith('/mock/peertube') ? rawBase : `${rawBase}/mock/peertube`;
    try {
      const res = await fetch(`${baseUrl}/api/v1/videos/${req.platform_post_id}`);
      if (!res.ok) {
        if (res.status === 404) return { status: 'deleted', live_url: '' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `PeerTube getStatus error: HTTP ${res.status}`, undefined, res.status);
      }

      const data = (await res.json()) as any;
      return {
        status: data.deleted ? 'deleted' : 'published',
        live_url: data.url || `${baseUrl}/w/${req.platform_post_id}`,
      };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to get PeerTube video status: ${err.message}`, true);
    }
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    const rawBase = (req.connection.base_url || (req as any).destination?.url || 'http://localhost:3001').replace(/\/+$/, '');
    const baseUrl = rawBase.endsWith('/mock/peertube') ? rawBase : `${rawBase}/mock/peertube`;
    const token = req.connection.token || req.connection.api_key || 'mock_peertube_token';

    try {
      const res = await fetch(`${baseUrl}/api/v1/videos/${req.platform_post_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      });

      if (!res.ok) {
        if (res.status === 404) return { deleted: true, reason: 'Already deleted' };
        const errCode = mapPlatformStatusToErrorCode(res.status, this.manifest.error_map);
        throw new ConnectorError(errCode, `PeerTube delete error: HTTP ${res.status}`, undefined, res.status);
      }

      return { deleted: true };
    } catch (err: any) {
      if (err instanceof ConnectorError) throw err;
      throw new ConnectorError('PLATFORM_UNAVAILABLE', `Failed to delete PeerTube video: ${err.message}`, true);
    }
  }

  async fetchMetrics(req: MetricsRequest): Promise<MetricsResult> {
    return {
      views: 730,
      likes: 62,
      comments: 17,
      shares: 31,
      clicks: 58,
      watch_time_s: 14200,
    };
  }
}
