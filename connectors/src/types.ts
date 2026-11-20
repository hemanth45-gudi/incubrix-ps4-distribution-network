export type StandardErrorCode =
  | 'DEST_SPEC_VIOLATION'
  | 'DEST_RULE_FREQUENCY_CAP'
  | 'CONNECTION_AUTH_EXPIRED'
  | 'PLATFORM_RATE_LIMIT'
  | 'PLATFORM_QUOTA_EXHAUSTED'
  | 'PLATFORM_CONTENT_REJECTED'
  | 'PLATFORM_UNAVAILABLE'
  | 'CONNECTOR_DISABLED';

export interface StandardApiError {
  error: {
    code: StandardErrorCode | string;
    message: string;
    retryable: boolean;
    details?: Record<string, any>;
  };
}

export interface ContentRendition {
  title?: string;
  body: string;
  media_urls?: string[];
  tags?: string[];
  canonical_url?: string;
  is_ai_generated?: boolean;
  ai_disclosure?: string;
  custom_fields?: Record<string, any>;
}

export interface DestinationConfig {
  id: string;
  name: string;
  url: string;
  platform_key: string;
  surface?: string;
  category?: string | null;
  audience_tags?: string[];
  language?: string;
  geo?: string | null;
  est_audience?: number | null;
  rules_url?: string | null;
  frequency_cap?: { max_posts: number; window_days: number } | null;
  self_promo_allowed?: boolean;
  link_policy?: 'allowed' | 'prohibited' | 'canonical_only' | string;
  disclosure_required?: boolean;
  automation_allowed?: boolean;
  connector_key: string;
  relevance_score?: number;
  relevance_reason?: string | null;
  level?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | string;
  last_certified_at?: string | Date | null;
  status?: 'active' | 'disabled' | 'pending' | 'demoted' | string;
}

export interface ConnectionCredentials {
  base_url?: string;
  api_key?: string;
  username?: string;
  token?: string;
  secret?: string;
  community_name?: string;
  category_id?: number | string;
  extra_headers?: Record<string, string>;
  [key: string]: any;
}

export interface Violation {
  field: string;
  message: string;
  rule?: string;
}

export interface ValidateRequest {
  rendition: ContentRendition;
  destination: DestinationConfig;
  connection: ConnectionCredentials;
}

export interface ValidateResult {
  ok: boolean;
  violations: Violation[];
}

export interface PublishRequest {
  rendition: ContentRendition;
  destination: DestinationConfig;
  connection: ConnectionCredentials;
  idempotency_key: string;
  is_test?: boolean;
}

export interface PublishResult {
  platform_post_id: string;
  live_url: string;
  status: 'published' | 'queued' | 'pending';
}

export interface StatusRequest {
  platform_post_id: string;
  connection: ConnectionCredentials;
}

export interface StatusResult {
  status: 'published' | 'draft' | 'archived' | 'deleted' | 'unknown';
  live_url: string;
}

export interface DeleteRequest {
  platform_post_id: string;
  connection: ConnectionCredentials;
}

export interface DeleteResult {
  deleted: boolean;
  reason?: string;
}

export interface MetricsRequest {
  platform_post_id: string;
  connection: ConnectionCredentials;
  since?: string;
}

export interface MetricsResult {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  watch_time_s?: number;
  clicks: number;
}

export interface RefreshAuthRequest {
  connection: ConnectionCredentials;
}

export interface RefreshAuthResult {
  expires_at: string;
  refreshed_token?: string;
}

export interface AssistPackRequest {
  rendition: ContentRendition;
  destination: DestinationConfig;
}

export interface AssistPackResult {
  files: Array<{ name: string; url: string; mime_type?: string }>;
  caption: string;
  deep_link: string;
  checklist: string[];
  instructions?: string;
}

export interface ConnectorManifest {
  key: string;
  version: string;
  tier: 'native' | 'protocol' | 'bridge' | 'feed' | 'assisted';
  auth: 'api_key' | 'bearer_token' | 'hmac_sha256' | 'oauth2' | 'none';
  surfaces: Array<{
    key: string;
    content_types: string[];
    spec: {
      title_max_chars?: number;
      body_max_chars?: number;
      links_allowed?: boolean;
      max_tags?: number;
      supported_media_formats?: string[];
    };
  }>;
  rate_limits?: {
    per_connection?: {
      requests: number;
      per_seconds: number;
    };
  };
  capabilities: Array<'publish' | 'status' | 'delete' | 'metrics' | 'refresh_auth' | 'build_assist_pack'>;
  error_map: Record<string, StandardErrorCode>;
  instance_param?: string;
}
