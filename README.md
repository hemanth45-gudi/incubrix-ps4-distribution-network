# 🌐 IncuBrix — Distribution: Long-Tail Destination Network

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Status](https://img.shields.io/badge/Status-Production-brightgreen)
![Connectors](https://img.shields.io/badge/Connectors-9-orange)
![Destinations](https://img.shields.io/badge/Destinations-150-blueviolet)

> 🚀 Production-oriented, containerised connector service expanding IncuBrix content distribution beyond major social platforms into niche communities, developer blogs, federated forums, open video networks, and partner websites.

---

## 📌 Project Overview

The **Long-Tail Destination Network** is an automated, resilient content distribution engine that publishes, certifies, monitors, and tailors content across nine non-traditional connector platforms (Discourse, Lemmy, Dev.to, Ghost, HMAC-signed Webhooks, Assisted, Hashnode, Slack, and PeerTube). It manages a 150-destination catalogue of real community platforms and exposes a full REST API backed by PostgreSQL, Redis, BullMQ, and MinIO (S3-compatible).

---

## ⭐ Key Features

- 🔌 **9 platform connectors** — Discourse, Lemmy, Dev.to, Ghost, Webhook, Assisted, Hashnode, Slack, PeerTube
- 🗂️ **150-destination catalogue** of real community platforms
- ⚡ **Sync & async publishing** with BullMQ background jobs and progress tracking
- 🛡️ **Rules engine** — frequency caps, self-promo, link policy, AI disclosure, automation checks
- 🤖 **AI-assisted rule capture** with human confirmation
- 🔁 **Idempotency** using SHA-256 recursive hashing
- 🔄 **Exponential backoff retries + circuit breaker**
- 🚦 **Connector kill-switch** for instant platform isolation
- ✂️ **Platform-aware content tailoring**
- 🎯 **Destination recommender** with Precision@10 evaluation
- 📅 **30-day automatic recertification**
- 📥 **Bulk CSV catalogue import** (1000 rows in under 5 minutes)
- 📊 **Normalised metrics** — views, likes, comments, shares, clicks
- 🔒 **SSRF-safe storage** via MinIO / S3
- 🧪 **Simulation mode** with in-process mock platforms
- 🖥️ **10-tab React dashboard**
- 🐳 **Docker Compose** full-stack deployment

---

## 🛠️ Stack

| Layer | Technology |
|:--- |:--- |
| ⚙️ Runtime | Node.js 20 |
| 📝 Language | TypeScript 5 (ESM, strict) |
| 🌐 Web Framework | Express 4 |
| 🗄️ ORM / DB | Prisma + PostgreSQL 16 |
| ⏱️ Background Jobs | BullMQ + Redis 7 |
| 📦 Object Storage | MinIO (S3-compatible, simulated in dev) |
| 🎨 Frontend | React 18, Vite 5, Tailwind CSS 3 |
| 🧪 Testing | Vitest + Supertest |
| 🐳 Containerisation | Docker Compose |

---

## 📁 Monorepo Structure

```
incubrix-ps4/
├── backend/                      # Express API server (@incubrix/backend)
│   ├── src/
│   │   ├── app.ts                # Express application factory
│   │   ├── index.ts              # HTTP server entry point
│   │   ├── routes/
│   │   │   ├── api.ts            # All /api/v1/ management routes
│   │   │   ├── connector.ts      # /connector/v1/:key/* HTTP contract routes
│   │   │   └── health.ts         # /health and /ready probes
│   │   ├── catalogue/
│   │   │   ├── csvImporter.ts    # CSV import engine (1000-row < 5 min)
│   │   │   ├── generate150.ts    # Seed script for 150-destination catalogue
│   │   │   └── realDestinations.json  # 150 curated real destinations
│   │   ├── certification/
│   │   │   └── recertificationService.ts  # 30-day recertification scheduler
│   │   ├── database/
│   │   │   ├── client.ts         # Prisma client
│   │   │   └── repository.ts     # In-memory + Prisma repository layer
│   │   ├── jobs/
│   │   │   ├── queue.ts          # BullMQ queue setup
│   │   │   └── jobManager.ts     # Job enqueue, polling, HMAC callbacks
│   │   ├── middleware/
│   │   │   ├── correlationId.ts  # X-Correlation-Id propagation
│   │   │   └── errorHandler.ts   # Central error handler + AppError class
│   │   ├── mocks/
│   │   │   └── platformMocks.ts  # In-process mock servers for all platforms
│   │   ├── recommender/
│   │   │   ├── destinationRecommender.ts  # Composite scoring + Precision@10
│   │   │   ├── relevanceScorer.ts         # Relevance scoring 1–5
│   │   │   └── evaluationDataset.json     # Ground-truth test cases
│   │   ├── rules/
│   │   │   ├── rulesEngine.ts     # Pre-publication rule evaluation
│   │   │   └── aiRuleCapture.ts   # AI-assisted rule capture + human confirm
│   │   ├── services/
│   │   │   ├── publishingService.ts  # Core publish workflow orchestration
│   │   │   ├── idempotency.ts        # SHA-256 recursive idempotency store
│   │   │   ├── retryService.ts       # Exponential backoff + circuit breaker
│   │   │   └── storageService.ts     # MinIO/S3 upload and SSRF validation
│   │   ├── tailoring/
│   │   │   └── contentTailorer.ts    # Platform-aware content adaptation
│   │   ├── utils/
│   │   │   ├── logger.ts             # JSON structured logger + secret masking
│   │   │   └── manifestGenerator.ts  # Connector manifest validation
│   │   └── tests/                    # Vitest test suites (12 files)
│   ├── prisma/
│   │   └── schema.prisma         # Relational schema (Destination, Publication, Job, RuleDecision)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
├── connectors/                   # Connector package (@incubrix/connectors)
│   ├── src/
│   │   ├── implementations/      # 9 connector TypeScript implementations
│   │   │   ├── DiscourseConnector.ts
│   │   │   ├── LemmyConnector.ts
│   │   │   ├── DevtoConnector.ts
│   │   │   ├── GhostConnector.ts
│   │   │   ├── WebhookConnector.ts
│   │   │   ├── AssistedConnector.ts
│   │   │   ├── HashnodeConnector.ts
│   │   │   ├── SlackConnector.ts
│   │   │   └── PeerTubeConnector.ts
│   │   ├── base.ts               # Abstract BaseConnector class
│   │   ├── types.ts              # ConnectorContract interface
│   │   ├── registry.ts           # ConnectorRegistry with kill-switch support
│   │   ├── manifest.ts           # YAML manifest parser
│   │   └── init.ts               # Auto-register all connectors on startup
│   └── manifests/                # YAML manifests for all 9 connectors
│       ├── discourse.yaml
│       ├── lemmy.yaml
│       ├── devto.yaml
│       ├── ghost.yaml
│       ├── webhook.yaml
│       ├── assisted.yaml
│       ├── hashnode.yaml
│       ├── slack.yaml
│       └── peertube.yaml
├── frontend/                     # React dashboard (@incubrix/frontend)
│   ├── src/
│   │   ├── App.tsx               # 10-tab SPA dashboard
│   │   └── services/api.ts       # Typed API client for all endpoints
│   ├── vite.config.ts            # Vite + proxy to backend :3001
│   └── Dockerfile
├── scripts/
│   └── batch-runner/
│       ├── index.ts              # CLI batch publication runner
│       └── sample-batch.json     # Sample batch job definitions
├── docker-compose.yml            # Full stack: postgres, redis, minio, backend, frontend
├── package.json                  # npm workspaces root
├── .env.example                  # Environment variable template
├── openapi.yaml                  # OpenAPI 3.1 specification
├── README.md
├── REPORT.md
├── SOURCES.md
└── AI_USE.md
```

---

## 🚀 Quick Start (Development)

### ✅ Prerequisites

- 🟢 Node.js 20+
- 🐘 PostgreSQL 16 running locally (or Docker Compose)
- 🔴 Redis 7 running locally (or Docker Compose)

### 1️⃣ Install dependencies

```bash
npm install
```

### 2️⃣ Configure environment

```bash
cp .env.example .env
# Edit .env as needed (see Environment Variables section)
```

### 3️⃣ Start the backend API server

```bash
npm run dev --workspace=@incubrix/backend
```

The API server starts at `http://localhost:3001` with `SIMULATION_MODE=true` by default — no real external API calls are made.

### 4️⃣ Start the frontend dashboard

```bash
npm run dev --workspace=@incubrix/frontend
```

The React dashboard starts at `http://localhost:3000` and proxies all API requests to `http://localhost:3001`.

### 5️⃣ Seed the 150-destination catalogue

```bash
npm run seed --workspace=@incubrix/backend
```

---

## 🐳 Docker Compose (Full Stack)

> [!IMPORTANT]
> Requires Docker Desktop installed and running. All services including PostgreSQL, Redis, MinIO, the backend, and the frontend are orchestrated together.

```bash
docker compose up -d
```

| Service | Port | Description |
|:--- |:--- |:--- |
| 🐘 `postgres` | 5432 | PostgreSQL 16 database |
| 🔴 `redis` | 6379 | Redis 7 for BullMQ queues |
| 📦 `minio` | 9000 / 9001 | S3-compatible object storage |
| ⚙️ `backend` | 3001 | Express API server |
| 🖥️ `frontend` | 3000 | React dashboard (nginx) |

🛑 Stop everything:

```bash
docker compose down -v
```

---

## 🔐 Environment Variables

Create a `.env` file at the project root (see `.env.example` for a full template):

```env
# Server
NODE_ENV=development
PORT=3001
API_PREFIX=/api/v1
SIMULATION_MODE=true          # true = all connectors use mock servers

# Database (PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/incubrix_network?schema=public

# Redis & Background Jobs
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MinIO / S3 Object Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=incubrix-artifacts

# Security
WEBHOOK_DEFAULT_SECRET=mock-webhook-secret-32-bytes-long!
ADMIN_API_KEY=incubrix-admin-dev-key

# Mock Platform Servers (used when SIMULATION_MODE=true)
MOCK_DISCOURSE_URL=http://localhost:4001
MOCK_LEMMY_URL=http://localhost:4002
MOCK_DEVTO_URL=http://localhost:4003
MOCK_GHOST_URL=http://localhost:4004
MOCK_WEBHOOK_RECEIVER_URL=http://localhost:4005
```

---

## 🧪 Simulation Mode

When `SIMULATION_MODE=true`, **no real external API calls are made**. All nine connectors point to in-process mock servers mounted under `/mock/*` routes:

| Mock Route | Simulated Platform |
|:--- |:--- |
| 💬 `/mock/discourse/*` | Discourse forum API |
| 🐭 `/mock/lemmy/*` | Lemmy federated API |
| 👩‍💻 `/mock/devto/*` | Dev.to articles API |
| 👻 `/mock/ghost/*` | Ghost Admin API |
| 🪝 `/mock/webhook/receiver` | HMAC webhook receiver |

⚠️ The mocks support configurable error states: rate limits, auth expiry, platform unavailability, and timeouts — enabling full end-to-end testing without real credentials.

---

## 🔌 Nine Connectors

| Connector Key | Platform | Capabilities |
|:--- |:--- |:--- |
| 💬 `discourse` | Discourse Forums | validate, publish, get_status, delete, fetch_metrics |
| 🐭 `lemmy` | Lemmy (Fediverse) | validate, publish, get_status, delete |
| 👩‍💻 `devto` | Dev.to | validate, publish, get_status, delete |
| 👻 `ghost` | Ghost CMS | validate, publish, get_status, delete |
| 🪝 `webhook` | Generic HMAC Webhook | validate, publish, get_status, delete |
| 🙋 `assisted` | Manual/Assisted Posting | validate, build_assist_pack (no automated publish) |
| ✍️ `hashnode` | Hashnode | validate, publish, get_status, delete |
| 💼 `slack` | Slack | validate, publish, get_status, delete |
| 🎬 `peertube` | PeerTube (Fediverse Video) | validate, publish, get_status, delete |

---

## 📡 API Endpoints

All management routes are under `/api/v1/`. 🔑 All `POST` endpoints require an `Idempotency-Key` header.

### 🏥 Infrastructure

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `GET` | `/health` | Liveness probe — returns `{ status: "ok" }` |
| `GET` | `/ready` | Readiness probe — checks database, redis, and storage |

### 📍 Destinations

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `GET` | `/api/v1/destinations` | List destinations (filter by `platform_key`, `status`) |
| `POST` | `/api/v1/destinations` | Create a new destination configuration |
| `GET` | `/api/v1/destinations/{id}` | Get destination by ID |
| `PATCH` | `/api/v1/destinations/{id}` | Update destination fields |
| `DELETE` | `/api/v1/destinations/{id}` | Delete destination |
| `GET` | `/api/v1/destinations/{id}/rules` | Get posting rules + recent decisions |
| `PUT` | `/api/v1/destinations/{id}/rules` | Update posting rules |

### 📤 Publishing

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `POST` | `/api/v1/publish` | Publish content (sync or async with `async:true`) |
| `GET` | `/api/v1/publications` | List all publications |
| `GET` | `/api/v1/publications/{id}` | Get publication detail |
| `POST` | `/api/v1/publications/{id}/delete` | Delete from platform + database |
| `GET` | `/api/v1/jobs/{job_id}` | Poll async job status (0–100 progress) |

### 📜 Rules Engine

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `POST` | `/api/v1/rules/evaluate` | Dry-run rule evaluation (no publish) |
| `POST` | `/api/v1/rules/capture` | AI-assisted rule extraction from policy text |
| `POST` | `/api/v1/rules/confirm` | Human confirmation of AI-captured draft rules |
| `GET` | `/api/v1/rules/drafts` | List unconfirmed AI rule drafts |

### ✨ Advanced Features

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `POST` | `/api/v1/tailor` | Tailor content body for a specific destination |
| `POST` | `/api/v1/recommendations` | Rank destinations for content (Precision@10 scorer) |
| `POST` | `/api/v1/recommendations/evaluate` | Evaluate recommender Precision@10 on test dataset |
| `GET` | `/api/v1/certifications` | List all destination certifications |
| `POST` | `/api/v1/certifications/recertify-due` | Run 30-day recertification cycle |
| `POST` | `/api/v1/catalogue/import` | Bulk import destinations from CSV |
| `GET` | `/api/v1/catalogue/imports` | Import history |
| `GET` | `/api/v1/metrics/{publication_id}` | Fetch normalised metrics (views/likes/comments/shares/clicks) |
| `POST` | `/api/v1/storage/upload` | Upload file or fetch public URL (SSRF-safe) |
| `GET` | `/api/v1/storage/{id}` | Download stored artifact |
| `POST` | `/api/v1/assisted/build-pack` | Generate human-posting assist pack |

### 🔗 Connector HTTP Contract

| Method | Endpoint | Description |
|:--- |:--- |:--- |
| `POST` | `/connector/v1/{connector_key}/validate` | Validate content against connector spec |
| `POST` | `/connector/v1/{connector_key}/publish` | Publish via connector |
| `POST` | `/connector/v1/{connector_key}/get_status` | Fetch platform post status |
| `POST` | `/connector/v1/{connector_key}/delete` | Delete platform post |

---

## 🧪 Testing

```bash
# Run all backend tests
npm run test --workspace=@incubrix/backend

# Run with coverage
npm run test --workspace=@incubrix/backend -- --coverage
```

The test suite comprises **12 test files** covering:

- 🔌 Connector contract tests (Discourse, Lemmy, Dev.to, Ghost, Webhook, Assisted) — full publish/status/delete lifecycle
- 📜 Rules engine unit tests (all rule types: frequency cap, self-promo, link policy, AI disclosure, automation)
- 🔁 Idempotency tests (SHA-256 conflict detection, duplicate prevention)
- ⏱️ Job manager tests (async enqueue, progress tracking, HMAC callbacks)
- 📤 Publishing workflow integration tests
- 🔄 Retry and circuit breaker tests
- 📦 Storage service tests (upload, SSRF validation)
- 🚦 Manifest and registry tests (connector kill-switch)
- ✂️ Content tailorer and relevance scorer tests

---

## 🖥️ CLI Batch Runner

Process publication suites from JSON input files:

```bash
# Run with the provided sample batch
npm run batch-runner

# Custom batch file
npx tsx scripts/batch-runner/index.ts --input path/to/my-batch.json
```

📄 Results are written to `results/batch-summary-{timestamp}.json`.

---

## 🏗️ Architecture Decisions

### 🔁 Idempotency (SHA-256 Recursive Hashing)
Every `POST /api/v1/publish` and `POST /connector/v1/:key/publish` accepts an `Idempotency-Key` header. The system computes a SHA-256 hash of the full request payload and stores the first response. Identical keys with matching payloads return the cached response (`HTTP 200`). Identical keys with *different* payloads are rejected with `HTTP 409 Conflict`.

### 🛡️ Rules Engine
Pre-publication checks run on every publish request: frequency caps, self-promotion policy, link restrictions, AI disclosure requirements, and automation permissions. Each decision is logged to the `RuleDecision` table. Failed rules produce `allow`, `block`, `reschedule`, or `route_assisted` actions.

### ⚡ Circuit Breaker
The retry service tracks consecutive failures per connector. After 5 consecutive platform-side failures (`PLATFORM_UNAVAILABLE`), the circuit opens and subsequent requests fail immediately without hitting the platform, protecting both the platform and the client.

### 🚦 Connector Registry Kill-Switch
The runtime `ConnectorRegistry` supports `enable()` and `disable()` operations. Disabling a connector returns `CONNECTOR_DISABLED` immediately, enabling instantaneous platform isolation without a code deploy.

### ⚙️ Configuration-Driven Multi-Instance
One connector implementation serves unlimited community instances through configuration parameters (`base_url`, `webhook_url`, `api_key`). Two Discourse forums, for example, share one `DiscourseConnector` class with different connection objects.

---

## ❌ Error Response Format

All errors conform to a standard envelope:

```json
{
  "error": {
    "code": "PLATFORM_RATE_LIMIT",
    "message": "Platform returned HTTP 429. Use Retry-After header.",
    "retryable": true,
    "details": {}
  }
}
```

| Code | Retryable | Cause |
|:--- |:--- |:--- |
| `DEST_SPEC_VIOLATION` | ❌ No | Content breaks destination format limits |
| `DEST_RULE_FREQUENCY_CAP` | ✅ Yes | Frequency cap; retry after window |
| `CONNECTION_AUTH_EXPIRED` | ❌ No | Token revoked or expired |
| `PLATFORM_RATE_LIMIT` | ✅ Yes | HTTP 429; back off with `Retry-After` |
| `PLATFORM_QUOTA_EXHAUSTED` | ✅ Yes | Daily quota exhausted |
| `PLATFORM_CONTENT_REJECTED` | ❌ No | Spam filter or banned phrases |
| `PLATFORM_UNAVAILABLE` | ✅ Yes | 5xx or timeout; circuit breaker active |
| `CONNECTOR_DISABLED` | ❌ No | Kill-switch active |

---

<p align="center">Made with ❤️ by the IncuBrix team</p>
