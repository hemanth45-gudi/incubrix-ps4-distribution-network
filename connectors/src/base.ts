import {
  ConnectorManifest,
  ContentRendition,
  DestinationConfig,
  ConnectionCredentials,
  ValidateRequest,
  ValidateResult,
  PublishRequest,
  PublishResult,
  StatusRequest,
  StatusResult,
  DeleteRequest,
  DeleteResult,
  MetricsRequest,
  MetricsResult,
  RefreshAuthRequest,
  RefreshAuthResult,
  AssistPackRequest,
  AssistPackResult,
  Violation,
} from './types.js';
import { ConnectorError } from './errors.js';

export interface IConnector {
  readonly key: string;
  readonly manifest: ConnectorManifest;
  enabled: boolean;

  validate(req: ValidateRequest): Promise<ValidateResult>;
  publish(req: PublishRequest): Promise<PublishResult>;
  getStatus(req: StatusRequest): Promise<StatusResult>;
  delete(req: DeleteRequest): Promise<DeleteResult>;

  fetchMetrics?(req: MetricsRequest): Promise<MetricsResult>;
  refreshAuth?(req: RefreshAuthRequest): Promise<RefreshAuthResult>;
  buildAssistPack?(req: AssistPackRequest): Promise<AssistPackResult>;
}

export abstract class BaseConnector implements IConnector {
  public enabled: boolean = true;

  constructor(public readonly manifest: ConnectorManifest) {}

  get key(): string {
    return this.manifest.key;
  }

  /**
   * Common validation logic against surface spec constraints
   */
  public async validate(req: ValidateRequest): Promise<ValidateResult> {
    const violations: Violation[] = [];
    const surfaceKey = req.destination.surface || this.manifest.surfaces[0]?.key;
    const surface = this.manifest.surfaces.find((s) => s.key === surfaceKey) || this.manifest.surfaces[0];

    if (!surface) {
      violations.push({
        field: 'surface',
        message: `Surface '${surfaceKey}' is not supported by connector '${this.key}'`,
      });
      return { ok: false, violations };
    }

    const { spec } = surface;

    // Check title limits
    if (spec.title_max_chars !== undefined && req.rendition.title) {
      if (req.rendition.title.length > spec.title_max_chars) {
        violations.push({
          field: 'title',
          message: `Title length (${req.rendition.title.length}) exceeds maximum limit of ${spec.title_max_chars} characters`,
          rule: 'SPEC_LIMIT',
        });
      }
    }

    // Check body limits
    if (spec.body_max_chars !== undefined) {
      if (!req.rendition.body || req.rendition.body.trim().length === 0) {
        violations.push({
          field: 'body',
          message: 'Content body cannot be empty',
          rule: 'SPEC_REQUIRED',
        });
      } else if (req.rendition.body.length > spec.body_max_chars) {
        violations.push({
          field: 'body',
          message: `Body length (${req.rendition.body.length}) exceeds maximum limit of ${spec.body_max_chars} characters`,
          rule: 'SPEC_LIMIT',
        });
      }
    }

    // Check link permissions
    if (spec.links_allowed === false) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      if (urlRegex.test(req.rendition.body) || req.rendition.canonical_url) {
        violations.push({
          field: 'links',
          message: `Links are prohibited on destination '${req.destination.name}'`,
          rule: 'LINK_POLICY',
        });
      }
    }

    // Check max tags
    if (spec.max_tags !== undefined && req.rendition.tags) {
      if (req.rendition.tags.length > spec.max_tags) {
        violations.push({
          field: 'tags',
          message: `Tags count (${req.rendition.tags.length}) exceeds allowed maximum of ${spec.max_tags}`,
          rule: 'SPEC_LIMIT',
        });
      }
    }

    // Validate instance configuration parameter (e.g. base_url or webhook_url)
    if (this.manifest.instance_param) {
      const paramName = this.manifest.instance_param;
      const paramValue = (req.connection as any)[paramName] || (req.destination as any)[paramName] || req.destination.url;
      if (!paramValue) {
        violations.push({
          field: paramName,
          message: `Missing instance configuration parameter: '${paramName}'`,
          rule: 'CONNECTION_PARAM_REQUIRED',
        });
      }
    }

    return {
      ok: violations.length === 0,
      violations,
    };
  }

  abstract publish(req: PublishRequest): Promise<PublishResult>;
  abstract getStatus(req: StatusRequest): Promise<StatusResult>;
  abstract delete(req: DeleteRequest): Promise<DeleteResult>;

  protected ensureCapability(capability: string): void {
    if (!this.manifest.capabilities.includes(capability as any)) {
      throw new ConnectorError(
        'DEST_SPEC_VIOLATION',
        `Capability '${capability}' is not supported by connector '${this.key}'`,
        false,
        400
      );
    }
  }
}
