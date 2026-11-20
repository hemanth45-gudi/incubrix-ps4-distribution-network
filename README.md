# IncuBrix — Long-Tail Destination Network

> Production-oriented, containerised connector service expanding IncuBrix content distribution beyond major social platforms into smaller communities, developer blogs, niche forums, open networks, and partner websites.

---

## 1. Project Overview

The **Long-Tail Destination Network** is an automated, resilient content distribution engine designed to publish, certify, monitor, and tailor content across non-traditional platforms (Discourse, Lemmy, Dev.to, Ghost, custom HMAC-signed webhooks, and manual assisted-posting workflows).

### Core Architectural Pillars
- **Decoupled Connector Contract**: Standardized interface (`validate`, `publish`, `get_status`, `delete`, `fetch_metrics`, `build_assist_pack`) isolated from the application persistence layer. Connector methods return data objects only; they do not write to the database directly.
- **Central Posting Rules Engine**: Pre-publication rule checks for frequency caps, self-promotion policies, link rules, and AI disclosure requirements with persistent decision logging.
- **Dynamic Connector Registry & Kill Switch**: Runtime registry supporting `register`, `get`, `list`, `has`, `enable`, `disable`, and `unregister`. Enables instantaneous kill-switching of malfunctioning platforms (`CONNECTOR_DISABLED`).
- **Configuration-Driven Multi-Instance Architecture**: One connector serves unlimited community instances via configuration (`base_url` or `webhook_url`) without requiring new connector code.
- **Strict Idempotency Contract**: SHA-256 recursive payload hashing guarantees zero duplicate posts on client retries or network timeouts, while rejecting conflicting payloads with `HTTP 409 Conflict`.
- **Background Jobs (BullMQ / Async)**: Operations exceeding 2 seconds return HTTP 202 Accepted with polling and HMAC-signed webhook callbacks.
- **Storage & SSRF Protection**: S3/MinIO compatible artifact storage with strict private IP blocking against server-side request forgery.
- **Built-in Platform Mocks**: Offline high-fidelity mock servers for Discourse, Lemmy, Dev.to, Ghost, and Webhooks supporting rate limits, timeouts, and auth failures.
- **CLI Batch Runner**: Automated CLI runner to process batch publication suites with detailed summary reporting.

---

## 2. API Endpoints Overview

All management routes are served under `/api/v1/`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Cloud-native liveness probe |
| `GET` | `/ready` | Deep readiness probe checking database, redis, and storage |
| `POST` | `/api/v1/publish` | Central publishing workflow (Supports `Idempotency-Key` & `async: true`) |
| `GET` | `/api/v1/publications` | List all historical publications |
| `GET` | `/api/v1/publications/:id` | Get publication details and status |
| `POST` | `/api/v1/publications/:id/delete` | Delete publication from destination and database |
| `GET` | `/api/v1/destinations` | List destination catalogue |
| `POST` | `/api/v1/destinations` | Create destination configuration |
| `GET` | `/api/v1/destinations/:id/rules`| View posting rules and recent decision logs |
| `POST` | `/api/v1/rules/evaluate` | Dry-run rule evaluation without publishing |
| `GET` | `/api/v1/jobs/:job_id` | Check background job status and progress (0–100) |
| `POST` | `/api/v1/assisted/build-pack` | Generate human assisted-posting kit |
| `POST` | `/api/v1/storage/upload` | Upload artifact or download safe public asset |
| `GET` | `/api/v1/storage/:id` | Download stored artifact |

---

## 3. The 8 Shared Error Codes

All errors conform to `{ error: { code, message, retryable, details } }`:

| Code | Retryable | Cause / Resolution |
| :--- | :--- | :--- |
| `DEST_SPEC_VIOLATION` | No | Content breaks destination format limits (title too long, bad tags). |
| `DEST_RULE_FREQUENCY_CAP` | Yes | Frequency cap reached; retry after window expires. |
| `CONNECTION_AUTH_EXPIRED` | No | Token revoked or expired; requires credential refresh. |
| `PLATFORM_RATE_LIMIT` | Yes | HTTP 429 received; back off using `Retry-After`. |
| `PLATFORM_QUOTA_EXHAUSTED` | Yes | Platform daily quota exhausted; retry in next window. |
| `PLATFORM_CONTENT_REJECTED` | No | Platform rejected body/media (e.g. spam trigger or banned phrases). |
| `PLATFORM_UNAVAILABLE` | Yes | HTTP 500/502/503/504 or network timeout; stop after 5 failures. |
| `CONNECTOR_DISABLED` | No | Connector kill switch is active or connector is unregistered. |

---

## 4. CLI Batch Runner

Run repeatable batch publishing suites using the CLI batch runner:

```bash
# Execute sample batch suite
npm run batch-runner

# Or pass a custom input file
npx tsx scripts/batch-runner/index.ts --input path/to/my-batch.json
```

Results and summary reports are automatically saved to `results/batch-summary.json`.

---

## 5. Development & Testing Commands

```bash
# 1. Install Dependencies
npm install

# 2. Build All Packages
npm run build --workspaces

# 3. Run All Unit, Integration & Contract Tests (52 Tests)
npm run test --workspace=@incubrix/backend

# 4. Start Development Servers
npm run dev:backend    # http://localhost:3001
npm run dev:frontend   # http://localhost:3000
```
