# SOURCES.md — Dependency, API, and License Registry

This document catalogues every external library, API, dataset, and runtime used in the **IncuBrix: Long-Tail Destination Network** system. All dependencies have been audited to ensure permissive commercial licenses (MIT, Apache-2.0, BSD-3-Clause) and to strictly avoid AGPL or restrictive copyleft licenses in the shipped services.

---

## 1. Backend Core Dependencies

| Package | Version | License | Commercial Use | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `express` | `^4.19.2` | MIT | Permitted | Fast, unopinionated HTTP server framework |
| `typescript` | `^5.4.5` | Apache-2.0 | Permitted | Static typing and compiler |
| `@prisma/client` | `^5.14.0` | Apache-2.0 | Permitted | Type-safe database ORM client |
| `prisma` | `^5.14.0` | Apache-2.0 | Permitted | Database schema migrations and client generator |
| `bullmq` | `^5.7.1` | MIT | Permitted | Distributed background job queue backed by Redis |
| `ioredis` | `^5.4.1` | MIT | Permitted | Robust Redis client with cluster and sentinel support |
| `zod` | `^3.23.8` | MIT | Permitted | Runtime schema validation for configs and inputs |
| `dotenv` | `^16.4.5` | BSD-2-Clause | Permitted | Environment variable loader from `.env` files |
| `cors` | `^2.8.5` | MIT | Permitted | Cross-Origin Resource Sharing middleware |
| `uuid` | `^9.0.1` | MIT | Permitted | RFC4122 UUID generation for records and correlation IDs |
| `js-yaml` | `^4.1.0` | MIT | Permitted | YAML parser and serializer for connector manifests |

---

## 2. Testing & Quality Assurance

| Package | Version | License | Commercial Use | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `vitest` | `^1.6.0` | MIT | Permitted | High-performance unit and contract test framework |
| `supertest` | `^7.0.0` | MIT | Permitted | HTTP assertions and integration testing for Express routes |
| `tsx` | `^4.10.5` | MIT | Permitted | Fast TypeScript execution for development and testing |

---

## 3. Frontend Dashboard Dependencies

| Package | Version | License | Commercial Use | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `react` | `^18.3.1` | MIT | Permitted | Declarative UI rendering library |
| `react-dom` | `^18.3.1` | MIT | Permitted | DOM bindings for React |
| `vite` | `^5.2.11` | MIT | Permitted | Fast frontend bundler and HMR dev server |
| `tailwindcss` | `^3.4.3` | MIT | Permitted | Utility-first CSS styling framework |
| `lucide-react` | `^0.378.0` | ISC | Permitted | Clean, accessible iconography |
| `postcss` | `^8.4.38` | MIT | Permitted | CSS transformation pipeline |
| `autoprefixer` | `^10.4.19` | MIT | Permitted | CSS vendor prefixer |

---

## 4. Infrastructure & Container Images

| Image | Version | License | Purpose |
| :--- | :--- | :--- | :--- |
| `postgres` | `16-alpine` | PostgreSQL License (Permissive) | Relational database for catalogues, rules, and jobs |
| `redis` | `7-alpine` | BSD-3-Clause | Memory store for BullMQ background queues and rate limits |
| `minio/minio` | `RELEASE.2024-05-10T01-41-38Z` | AGPL-3.0 (Standalone Infrastructure) | Local S3-compatible object storage for artifacts. *Note: Used as standalone external container; backend uses standard AWS S3 SDK (Apache-2.0)* |
| `nginx` | `alpine` | BSD-2-Clause | Lightweight web server for frontend production container |

---

## 5. Compliance & Policy Verification

- **AGPL Avoidance**: No AGPL libraries are bundled or linked into the Node.js application codebase. MinIO runs exclusively as an external decoupled infrastructure container and is fully swappable with AWS S3, Cloudflare R2, or local file storage.
- **Data Privacy**: No private customer or proprietary IncuBrix tokens are committed to source control. Secret masking is enforced in logging.
