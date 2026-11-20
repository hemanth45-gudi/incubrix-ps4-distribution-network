// ============================================================
// IncuBrix API Service Layer
// All fetches use relative URLs; Vite proxies to backend.
// ============================================================

// ─── Utility ─────────────────────────────────────────────────
export function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message || body?.message || msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ─── Health / Readiness ──────────────────────────────────────
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
  uptime_seconds: number;
  simulation_mode: boolean;
}

export interface ReadinessResponse {
  status: 'ready' | 'degraded';
  timestamp: string;
  checks: {
    database: { status: 'ok' | 'error'; message: string; latency_ms?: number };
    redis: { status: 'ok' | 'error'; message: string; latency_ms?: number };
    storage: { status: 'ok' | 'error'; message: string };
  };
}

export const fetchHealth = (): Promise<HealthResponse> => apiFetch('/health');
export const fetchReadiness = (): Promise<ReadinessResponse> => apiFetch('/ready');

// ─── Destinations ─────────────────────────────────────────────
export interface Destination {
  id: string;
  name: string;
  url: string;
  platform_key: string;
  connector_key: string;
  language: string;
  status: string;
  audience_tags: string[];
  relevance_score: number;
  last_certified_at: string | null;
}

export const fetchDestinations = (): Promise<Destination[]> =>
  apiFetch<Destination[] | { data: Destination[] }>('/api/v1/destinations').then((r) =>
    Array.isArray(r) ? r : (r as { data: Destination[] }).data ?? []
  );

export interface AddDestinationPayload {
  name: string;
  url: string;
  platform_key: string;
  connector_key: string;
  language: string;
}

export const addDestination = (payload: AddDestinationPayload): Promise<Destination> =>
  apiFetch('/api/v1/destinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// ─── Publications ─────────────────────────────────────────────
export interface Publication {
  id: string;
  destination_id: string;
  title: string;
  status: string;
  platform_post_id?: string;
  live_url?: string;
  created_at: string;
}

export const fetchPublications = (): Promise<Publication[]> =>
  apiFetch<Publication[] | { data: Publication[] }>('/api/v1/publications').then((r) =>
    Array.isArray(r) ? r : (r as { data: Publication[] }).data ?? []
  );

// ─── Publish ──────────────────────────────────────────────────
export interface PublishPayload {
  destination_id: string;
  title: string;
  body: string;
  tags: string[];
  idempotency_key: string;
  async?: boolean;
  callback_url?: string;
}

export interface PublishResult {
  publication_id?: string;
  platform_post_id?: string;
  live_url?: string;
  status?: string;
  job_id?: string;
  message?: string;
}

export const publishContent = (payload: PublishPayload): Promise<PublishResult> =>
  apiFetch('/api/v1/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// ─── Rules ────────────────────────────────────────────────────
export interface RulesEvaluatePayload {
  destination_id: string;
  title: string;
  body: string;
  tags: string[];
}

export interface RulesEvaluateResult {
  verdict: 'pass' | 'block' | 'reschedule';
  reasons: string[];
  rules_matched?: number;
}

export const evaluateRules = (payload: RulesEvaluatePayload): Promise<RulesEvaluateResult> =>
  apiFetch('/api/v1/rules/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export interface RulesCapturePayload {
  policy_text: string;
  destination_id: string;
}

export interface DraftRule {
  id?: string;
  rule_text: string;
  confidence: number;
  evidence: string;
}

export interface RulesCaptureResult {
  draft_rules: DraftRule[];
  capture_id?: string;
}

export const captureRules = (payload: RulesCapturePayload): Promise<RulesCaptureResult> =>
  apiFetch('/api/v1/rules/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export interface RulesConfirmPayload {
  capture_id?: string;
  destination_id?: string;
  confirmed: boolean;
}

export const confirmRules = (payload: RulesConfirmPayload): Promise<{ message: string }> =>
  apiFetch('/api/v1/rules/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// ─── Certifications ──────────────────────────────────────────
export interface Certification {
  id: string;
  name: string;
  platform: string;
  status: string;
  last_certified_at: string | null;
  days_since: number | null;
  recertification_due: boolean;
}

export const fetchCertifications = (): Promise<Certification[]> =>
  apiFetch<Certification[] | { data: Certification[] }>('/api/v1/certifications').then((r) =>
    Array.isArray(r) ? r : (r as { data: Certification[] }).data ?? []
  );

export interface RecertifyResult {
  processed: number;
  outcomes: Array<{ name: string; platform: string; result: string; status?: string }>;
}

export const recertifyDue = (): Promise<RecertifyResult> =>
  apiFetch('/api/v1/certifications/recertify-due', { method: 'POST' });

// ─── Catalogue Import ─────────────────────────────────────────
export interface ImportSummary {
  total_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  duration_ms: number;
  errors?: Array<{ row: number; error: string }>;
}

export const importCatalogue = (csvText: string): Promise<ImportSummary> =>
  apiFetch('/api/v1/catalogue/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: csvText,
  });

export interface ImportRecord {
  id: string;
  created_at: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
}

export const fetchImportHistory = (): Promise<ImportRecord[]> =>
  apiFetch<ImportRecord[] | { data: ImportRecord[] }>('/api/v1/catalogue/imports').then((r) =>
    Array.isArray(r) ? r : (r as { data: ImportRecord[] }).data ?? []
  );

// ─── Recommendations ─────────────────────────────────────────
export interface RecommendationsPayload {
  title: string;
  body: string;
  tags: string[];
  is_commercial: boolean;
}

export interface RecommendationItem {
  rank: number;
  score: number;
  destination_id: string;
  name: string;
  platform: string;
  reasons: string[];
  warnings: string[];
}

export interface RecommendationsResult {
  recommendations: RecommendationItem[];
}

export const fetchRecommendations = (payload: RecommendationsPayload): Promise<RecommendationsResult> =>
  apiFetch('/api/v1/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export interface EvaluatePrecisionResult {
  average_precision_at_10: number;
  cases: Array<{ query: string; precision: number }>;
}

export const evaluatePrecision = (): Promise<EvaluatePrecisionResult> =>
  apiFetch('/api/v1/recommendations/evaluate', { method: 'POST' });

// ─── Metrics ─────────────────────────────────────────────────
export interface MetricsResult {
  publication_id: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  fetched_at?: string;
}

export const fetchMetrics = (publicationId: string): Promise<MetricsResult> =>
  apiFetch(`/api/v1/metrics/${publicationId}`);

// ─── Connectors ───────────────────────────────────────────────
export interface ConnectorInfo {
  key: string;
  name: string;
  description: string;
  capabilities: string[];
  status?: string;
}

export const testConnector = (key: string, payload: Record<string, unknown>): Promise<{ valid: boolean; message?: string }> =>
  apiFetch(`/connector/v1/${key}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
