import { BaseConnector } from '../base.js';
import {
  ConnectorManifest,
  PublishRequest,
  PublishResult,
  StatusRequest,
  StatusResult,
  DeleteRequest,
  DeleteResult,
  AssistPackRequest,
  AssistPackResult,
} from '../types.js';
import { ConnectorError } from '../errors.js';

export class AssistedConnector extends BaseConnector {
  constructor(manifest: ConnectorManifest) {
    super(manifest);
  }

  /**
   * Section 4.F: Some communities do not permit automated publishing.
   * This connector must NOT publish automatically.
   */
  async publish(req: PublishRequest): Promise<PublishResult> {
    throw new ConnectorError(
      'DEST_SPEC_VIOLATION',
      `Destination '${req.destination.name}' does not permit automated publishing. Use buildAssistPack to generate a human posting kit.`,
      false,
      400,
      { destination_id: req.destination.id, automation_allowed: false }
    );
  }

  async getStatus(req: StatusRequest): Promise<StatusResult> {
    return {
      status: 'unknown',
      live_url: '',
    };
  }

  async delete(req: DeleteRequest): Promise<DeleteResult> {
    throw new ConnectorError(
      'DEST_SPEC_VIOLATION',
      'Assisted connector does not support automated post deletion. Content must be removed by community author.',
      false,
      400
    );
  }

  async buildAssistPack(req: AssistPackRequest): Promise<AssistPackResult> {
    const validation = await this.validate({
      rendition: req.rendition,
      destination: req.destination,
      connection: {},
    });

    const checklist: string[] = [
      'Verify content matches community topic guidelines.',
      req.destination.self_promo_allowed
        ? 'Self-promotion is allowed; ensure it provides authentic value.'
        : 'CRITICAL: Self-promotion is PROHIBITED in this community. Remove promotional links.',
      req.destination.link_policy === 'prohibited'
        ? 'Links are strictly forbidden. Remove all URLs.'
        : 'Ensure links point to high-quality canonical sources.',
      req.destination.disclosure_required
        ? 'AI disclosure required: ensure #AI or disclaimer statement is visible in post body.'
        : 'AI disclosure is optional.',
      'Check destination posting frequency cap before publishing.',
    ];

    const files = (req.rendition.media_urls || []).map((url, i) => ({
      name: `asset-${i + 1}`,
      url,
      mime_type: 'image/jpeg',
    }));

    const caption = req.rendition.title
      ? `**${req.rendition.title}**\n\n${req.rendition.body}`
      : req.rendition.body;

    const deepLink = req.destination.url.replace(/\/+$/, '') + '/submit';

    return {
      files,
      caption,
      deep_link: deepLink,
      checklist,
      instructions: `1. Open submit page at ${deepLink}\n2. Paste caption\n3. Review posting checklist\n4. Submit manually`,
    };
  }
}
