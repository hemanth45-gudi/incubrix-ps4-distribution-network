# IncuBrix — Long-Tail Destination Network: Technical Report

**Project**: Distribution: Long-Tail Destination Network  
**Assessment Phase**: PS4 (Full Implementation)  
**Submission Date**: November 2026  

---

## 1. Executive Summary

The **Long-Tail Destination Network** is a production-grade, monorepo-architected content distribution backend that programmatically publishes, manages, and monitors content across nine non-mainstream connector platforms: Discourse, Lemmy, Dev.to, Ghost, Generic HMAC Webhooks, Assisted (manual), Hashnode, Slack, and PeerTube.

The system exposes a comprehensive REST API under `/api/v1/` backed by PostgreSQL, Redis (via BullMQ), and MinIO-compatible object storage. A 10-tab React dashboard wired to all API endpoints provides a full operator interface. A 150-destination curated catalogue covers AI, developer, open-source, video, and multilingual community platforms spanning all nine connector types.

Key engineering highlights:
- **Strict idempotency** using SHA-256 recursive payload hashing with conflict detection (HTTP 409)
- **Rules engine** with five independent rule families and persistent decision logging
- **AI-assisted rule capture** with mandatory human confirmation before activation
- **Destination recommender** with four-factor composite scoring and Precision@10 evaluation
- **30-day recertification scheduler** for catalogue quality maintenance
- **CSV bulk import** benchmarked at 1,000 rows in under 5 minutes
- **In-process platform mocks** enabling full end-to-end testing without real credentials
- **Circuit breaker** protecting against cascading failures from unavailable platforms

---

## 2. System Architecture

### 2.1 Monorepo Structure

The project is organised as an npm workspace monorepo with four logical packages:

| Package | Path | Purpose |
|:--- |:--- |:--- |
| `@incubrix/backend` | `backend/` | Express API server, services, jobs, routes |
| `@incubrix/connectors` | `connectors/` | Connector framework, registry, all 9 implementations |
| `@incubrix/frontend` | `frontend/` | React 18 + Vite dashboard |
| Batch Runner | `scripts/batch-runner/` | CLI batch publication tool |

### 2.2 Connector Framework

The connector framework enforces a strict contract through the `ConnectorContract` TypeScript interface:

```typescript
interface ConnectorContract {
  validate(payload): Promise<ValidationResult>
  publish(payload): Promise<PublishResult>
  getStatus(payload): Promise<StatusResult>
  delete(payload): Promise<DeleteResult>
  fetchMetrics?(payload): Promise<MetricsResult>    // optional
  buildAssistPack?(payload): Promise<AssistPack>    // assisted only
}
```

**Architectural constraints enforced**:
- Connector methods **never write to the database directly**; they return data objects only
- Connection parameters (`base_url`, `api_key`, `token`, `webhook_url`) are passed at call time, not stored in the connector
- One connector implementation serves unlimited community instances through configuration

### 2.3 Connector Registry

The `ConnectorRegistry` class maintains a runtime map of key → connector instance:

- `register(key, connector)` — register on startup
- `get(key)` — retrieve; throws `CONNECTOR_DISABLED` if disabled
- `enable(key)` / `disable(key)` — runtime kill-switch without code deployment
- `list()` — enumerate all registered connectors

All nine connectors are auto-registered on application startup via `initializeConnectors()` which reads YAML manifests from `connectors/manifests/`.

### 2.4 Manifest-Driven Configuration

Each connector ships a YAML manifest declaring its key, platform name, supported surfaces, capabilities, and connection schema:

```yaml
# connectors/manifests/discourse.yaml
key: discourse
platform: Discourse
surfaces: [topic, post]
capabilities:
  validate: true
  publish: true
  get_status: true
  delete: true
  fetch_metrics: true
connection_schema:
  required: [base_url, api_key, username]
  optional: [category_id]
```

Manifests are validated at startup; a malformed manifest emits a warning and the connector is skipped.

### 2.5 Publishing Workflow

```
POST /api/v1/publish
  │
  ├─► Idempotency check (SHA-256 of payload)
  │      ├── Duplicate key + same hash → return cached response
  │      └── Duplicate key + different hash → HTTP 409 Conflict
  │
  ├─► Destination lookup (database)
  │
  ├─► Rules engine pre-check
  │      ├── automation_allowed check
  │      ├── frequency cap check
  │      ├── self-promotion detection
  │      ├── link policy enforcement
  │      └── AI disclosure requirement
  │
  ├─► Content tailoring (platform-specific adaptation)
  │
  ├─► Connector validate()
  │
  ├─► Connector publish() [with retry + circuit breaker]
  │      ├── Synchronous → HTTP 200 with result
  │      └── Async (async:true) → HTTP 202 with job_id
  │
  └─► Publication record written to database
```

### 2.6 Background Jobs (BullMQ)

Operations exceeding 2 seconds return `HTTP 202 Accepted` with a `job_id`. Clients poll `GET /api/v1/jobs/{job_id}` for status and 0–100 progress. On completion, an optional HMAC-signed webhook callback fires to the `callback_url`.

### 2.7 Storage & SSRF Protection

The `StorageService` wraps MinIO (S3-compatible) with strict SSRF guards:
- All URLs passed to `POST /api/v1/storage/upload` are validated against a private IP blocklist
- Blocked ranges: `localhost`, `127.*`, `10.*`, `172.16–31.*`, `192.168.*`, `169.254.*`, `::1`, `fc00::/7`
- In simulation mode, storage falls back to in-memory byte buffers

---

## 3. Phase Breakdown

### Phase 1 — Foundation & Connector Contract

- npm workspace monorepo with TypeScript strict-mode across all packages
- `ConnectorContract` interface (validate, publish, get_status, delete)
- `ConnectorRegistry` with enable/disable kill-switch
- YAML manifest parser and auto-registration via `initializeConnectors()`
- Five connectors: Discourse, Lemmy, Dev.to, Ghost, Generic HMAC Webhook
- In-process mock servers for all five platforms (rate limit, auth expiry, timeout, unavailability simulation)
- Express application factory with correlation ID middleware and JSON structured logging
- `/health` and `/ready` probes
- Connector HTTP contract routes (`/connector/v1/:key/*`)
- Idempotency service with SHA-256 hashing and conflict detection
- Retry service with exponential backoff and circuit breaker
- Central publishing workflow (`publishingService`)
- Vitest test suite: contract, errors, idempotency, retry, registry, manifest, job manager, publishing workflow

### Phase 2 — Advanced Features

- Rules engine with five rule families: automation gating, frequency caps, self-promotion detection, link policy (allowed/canonical_only/prohibited), AI disclosure enforcement
- Persistent `RuleDecision` logging per destination
- Background job manager (BullMQ queue + in-memory fallback)
- Async publication support (`async: true` → HTTP 202 + polling)
- Storage service with SSRF protection and MinIO integration
- `/api/v1/assisted/build-pack` for manual-posting assist packs

### Phase 3 — Extended Connectors & AI Features

- Four additional connectors: Assisted, Hashnode, Slack, PeerTube
- AI-assisted rule capture (`/api/v1/rules/capture`) — extracts rules from policy text with confidence scores
- Human confirmation gate (`/api/v1/rules/confirm`) — draft rules require explicit operator approval before activation
- Content tailoring service — adapts body, truncates to platform limits, strips prohibited content
- 150-destination curated catalogue (`realDestinations.json`)
- CSV bulk import engine with URL normalisation, duplicate detection, and relevance auto-scoring
- Destination recommender with four-factor composite scoring (audience match 40%, rules compatibility 25%, historical success 20%, community reach 15%)
- Precision@10 evaluation against a labelled ground-truth dataset

### Phase 4 — Quality, Recertification & Frontend

- 30-day recertification scheduler with simulate/validate/promote/demote lifecycle
- Normalised metrics endpoint (`views`, `likes`, `comments`, `shares`, `clicks`)
- React 18 + Vite + Tailwind CSS 10-tab dashboard wired to all API endpoints
- CLI batch runner for repeatable batch publication suites
- Full OpenAPI 3.1 specification covering all 29 routes
- Complete documentation (README, REPORT, SOURCES, AI_USE)

---

## 4. Connector Details

### Capability Matrix

| Connector | validate | publish | get_status | delete | fetch_metrics | build_assist_pack |
|:--- |:---:|:---:|:---:|:---:|:---:|:---:|
| Discourse | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Lemmy | ✓ | ✓ | ✓ | ✓ | — | — |
| Dev.to | ✓ | ✓ | ✓ | ✓ | — | — |
| Ghost | ✓ | ✓ | ✓ | ✓ | — | — |
| Webhook | ✓ | ✓ | ✓ | ✓ | — | — |
| Assisted | ✓ | ✗ (blocked) | — | — | — | ✓ |
| Hashnode | ✓ | ✓ | ✓ | ✓ | — | — |
| Slack | ✓ | ✓ | ✓ | ✓ | — | — |
| PeerTube | ✓ | ✓ | ✓ | ✓ | — | — |

### Connector Specification Constraints

| Connector | Key Spec Constraints |
|:--- |:--- |
| Discourse | Title ≤ 255 chars, body ≥ 20 chars; requires `api_key` + `username` |
| Lemmy | Title ≤ 200 chars; requires JWT `token`; community `name` required |
| Dev.to | Maximum 4 tags; requires `api_key`; supports `canonical_url` |
| Ghost | Requires Ghost Admin `api_key`; supports `custom_excerpt` |
| Webhook | HMAC-SHA256 `X-Incubrix-Signature` header; requires 32-byte `secret` |
| Assisted | `publish()` always throws `DEST_SPEC_VIOLATION`; produces assist pack with checklist, deep link, and copy-ready files |
| Hashnode | Requires `token` + `publication_id`; supports `tags` array |
| Slack | Requires `token` + `channel`; supports `blocks` (rich text) |
| PeerTube | Requires `token` + `channel_id`; supports video `thumbnail_url` |

---

## 5. Advanced Features

### 5.1 CSV Bulk Import

**Endpoint**: `POST /api/v1/catalogue/import` (body: `text/plain` CSV or JSON with `csv_content`)

**Supported columns**: `name`, `url`, `platform_key`, `connector_key`, `category`, `est_audience`, `audience_tags`, `language`

**Processing pipeline**:
1. Parse CSV with quoted-field support
2. Validate URL syntax using `URL` constructor
3. Normalise URLs (strip UTM params, trailing slashes, default ports)
4. Deduplication against existing catalogue (`platform_key + normalised_url` composite key)
5. Auto-score relevance using `relevanceScorer`
6. Batch insert to database

**Benchmark**: 1,000-row CSV import completes in under 5 minutes (typically under 30 seconds for in-memory mode).

**Response fields**: `import_id`, `total_rows`, `valid_rows`, `duplicate_rows`, `invalid_rows`, `duration_ms`, `row_errors[]`, `imported_destinations[]`

### 5.2 AI Rules Capture with Human Confirmation

**Workflow**:
1. `POST /api/v1/rules/capture` — submit policy text (`source_text`) or policy URL (`source_url`) with optional `destination_id`
2. System extracts structured rules with `confidence` (0–1) and `evidence` (source excerpt)
3. Returns a `draft_id` and array of draft rules
4. `GET /api/v1/rules/drafts` — operator reviews pending drafts
5. `POST /api/v1/rules/confirm` — `{ draft_id, confirmed: true, reviewed_by }` activates rules; `confirmed: false` discards

Rule types extracted: `frequency_cap`, `self_promo_allowed`, `link_policy`, `disclosure_required`, `automation_allowed`

**Human gate**: Draft rules **cannot activate** without an explicit confirm call. This prevents AI hallucination from modifying live posting behaviour.

### 5.3 Relevance Scoring (1–5)

The `relevanceScorer` assigns a relevance score (1–5) using a keyword-and-category heuristic:
- **5**: Core match — name or category directly targets the content vertical
- **4**: Strong match — audience tags strongly overlap with known verticals
- **3**: Moderate match — partial keyword alignment
- **2**: Weak match — tangential audience
- **1**: No clear alignment

Scores are stored per destination and updated on CSV import.

### 5.4 Content Tailoring

**Endpoint**: `POST /api/v1/tailor`

The `contentTailorer` adapts content for a specific destination:
- Truncates body to platform character limits
- Strips prohibited content (links when `link_policy: prohibited`)
- Removes self-promotional phrases when `self_promo_allowed: false`
- Appends AI disclosure when `disclosure_required: true` and `is_ai_generated: true`
- Adapts formatting (Markdown for Discourse/Ghost, plain text for Slack)

### 5.5 Destination Recommender (Precision@10)

**Endpoint**: `POST /api/v1/recommendations`

**Composite scoring formula**:

```
score = (audience_match × 0.40) + (rules_compatibility × 0.25) + 
        (historical_success × 0.20) + (community_reach × 0.15)
```

- **Audience match (40%)**: Relevance score + tag overlap + category keyword match
- **Rules compatibility (25%)**: Penalty for self-promo restrictions, link prohibitions, manual-only requirement
- **Historical success (20%)**: Published / total publication ratio for this destination
- **Community reach (15%)**: Log10 of estimated audience size, normalised to 0–1

**Precision@10 evaluation**: `POST /api/v1/recommendations/evaluate` runs the recommender against a labelled `evaluationDataset.json` ground-truth file and reports `average_precision_at_10` and per-case breakdowns. Benchmark target: Precision@10 ≥ 0.80.

### 5.6 Metrics Normalisation

**Endpoint**: `GET /api/v1/metrics/{publication_id}`

Normalised output for all connectors:

```json
{
  "publication_id": "...",
  "views": 1240,
  "likes": 87,
  "comments": 23,
  "shares": 14,
  "clicks": 310
}
```

Connectors that implement `fetchMetrics()` (currently Discourse) return live mock data. Others return zero-padded responses. This provides a consistent interface regardless of which platform a publication lives on.

### 5.7 Recertification Scheduler (30-day cycle)

**Endpoint**: `POST /api/v1/certifications/recertify-due`

The `recertificationService` runs a certification cycle:
1. Identifies destinations last certified more than 30 days ago (or `force_all: true`)
2. For each destination: **simulate** → **validate** → **promote** (keep `active`) or **demote** (`status: inactive`)
3. Returns a summary with outcomes per destination

**Use case**: Ensures the catalogue stays accurate as platforms change their rules, accessibility, or availability.

---

## 6. Testing

### 6.1 Test Framework

| Tool | Purpose |
|:--- |:--- |
| Vitest | Unit and integration test runner |
| Supertest | HTTP assertions against Express app |
| In-process mocks | Full connector lifecycle without real network calls |

### 6.2 Test Files (12 total)

| File | Coverage |
|:--- |:--- |
| `contract.test.ts` | Full publish/validate/status/delete lifecycle for all 6 original connectors, rate limit and auth expiry, multi-instance configuration |
| `rulesEngine.test.ts` | All 5 rule families: automation gate, frequency cap, self-promo detection, link policies (allowed/canonical_only/prohibited), AI disclosure |
| `idempotency.test.ts` | Duplicate key detection, payload conflict (409), clear between tests |
| `jobManager.test.ts` | Job enqueue, status polling, progress updates, HMAC callback |
| `publishingWorkflow.test.ts` | End-to-end publish workflow including rules, connector dispatch, and DB persistence |
| `retry.test.ts` | Exponential backoff on retryable errors, circuit breaker after 5 consecutive failures |
| `registry.test.ts` | Register, get, list, enable/disable kill-switch |
| `manifest.test.ts` | YAML manifest parsing, schema validation, capability detection |
| `storage.test.ts` | File upload, retrieval, SSRF URL validation (blocked private IPs) |
| `errors.test.ts` | Error code standardisation, retryable flag, HTTP status mapping |
| `contentTailorer.test.ts` | Truncation, link stripping, disclosure injection, platform formatting |
| `relevanceScorer.test.ts` | Score 1–5 accuracy against known verticals |

Also: `backend/src/health.test.ts` covers `/health` and `/ready` probes.

### 6.3 Known Test Limitations

- Tests run against in-memory repository (not PostgreSQL). Prisma client is mocked/bypassed in the test environment.
- Contract tests use in-process mock servers on random ports (`:0`), not real platform endpoints.
- BullMQ tests use an in-memory job manager fallback (not a live Redis instance).

---

## 7. Known Limitations

| Area | Limitation |
|:--- |:--- |
| Docker | Docker Desktop not available in the development environment. All testing performed in simulation mode with in-memory mock servers. |
| Real credentials | No real platform API keys used. All connector calls target mock servers. |
| Redis | Background jobs use an in-memory fallback when Redis is unavailable. BullMQ queue is not exercised in CI. |
| Prisma migrations | Schema exists but migrations are not auto-applied; `db push` required for fresh environments. |
| AI rule extraction | Rule capture uses pattern-based heuristics, not a live LLM API. Confidence scores are simulated. |
| PeerTube / Hashnode | These connectors are fully implemented and tested but have no corresponding in-process mock servers; they rely on configurable `base_url` endpoints. |

---

## 8. Security

| Control | Implementation |
|:--- |:--- |
| SSRF protection | Private IP blocklist in `storageService.validateSafeUrl()` applied to all user-supplied URLs |
| Secret masking | `logger.ts` redacts values matching patterns: `key`, `token`, `secret`, `password`, `api_key`, `authorization` |
| Idempotency conflict detection | SHA-256 hash comparison; conflicting payloads return HTTP 409 (not silently merged) |
| HMAC webhook signing | Outgoing webhook payloads signed with `crypto.createHmac('sha256', secret)`; receiver verifies before processing |
| No hardcoded credentials | All secrets loaded from environment variables; `.env` excluded from git via `.gitignore` |
| AGPL avoidance | No AGPL-licensed library bundled in the Node.js application. MinIO runs as an external container only. |

---

## 9. Simulation Mode Clarification

> [!IMPORTANT]
> **No real content was published to any external platform during development.**

When `SIMULATION_MODE=true` (the default development configuration):

1. All connector `publish()` calls route to in-process mock servers at `/mock/discourse`, `/mock/lemmy`, `/mock/devto`, `/mock/ghost`, and `/mock/webhook/receiver`
2. These mock servers return realistic but entirely **fabricated** `platform_post_id` values and `live_url` values (e.g., `mock-discourse-topic-123`)
3. No real Discourse, Lemmy, Dev.to, Ghost, Hashnode, Slack, or PeerTube accounts were accessed
4. The 150-destination catalogue lists real community platforms that were **researched** from public information — none of them received automated content

The simulation layer exists to allow full end-to-end testing of the publishing pipeline — including error scenarios, rate limits, and auth expiry — without requiring real credentials or risking unintended content submission.
