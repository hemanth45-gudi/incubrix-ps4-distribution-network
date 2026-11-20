# AI_USE.md — AI Coding Assistant Usage & Review Disclosure

This document discloses the use of AI tools during the development of the **IncuBrix: Long-Tail Destination Network** individual engineering assessment, detailing models used, code generated, manual engineering reviews, and human verification performed.

---

## 1. Assistants & Models Used

- **Primary Assistant**: Antigravity by Google DeepMind
- **Model**: Gemini 3.8 Flash (High) / Gemini Flash
- **Operating Environment**: Windows PowerShell Sandbox (Standard & Elevated Bypass for network dependencies)

---

## 2. Responsibilities & Breakdown of AI Assistance

### A. Architectural Design & Scaffolding
- **AI Role**: Assisted in structuring the monorepo architecture, creating npm workspace configs, defining TypeScript types for the connector contract, and laying out the Prisma relational schema.
- **Human Verification**: Verified modular separation between connector modules, backend application services, and background queue workers to ensure connector methods never write directly to the database.

### B. Standard Code Generation
- **AI Role**: Scaffolded boilerplate configuration files (`docker-compose.yml`, `tsconfig.json`, `tailwind.config.js`, `vite.config.ts`), structured JSON logging with secret masking, and health/readiness endpoints.
- **Human Verification**: Audited secret masking logic (`maskSecrets`) against common credential keywords, confirmed correlation ID propagation (`X-Correlation-Id`), and tested HTTP status codes under both normal and degraded dependency states.

### C. Testing & Assertions
- **AI Role**: Generated Vitest unit and HTTP integration test suites using Supertest for health endpoints, readiness probes, and logging security.
- **Human Verification**: Executed test suites locally in sandbox, verified assertions reflect actual system behavior rather than trivial mock assertions, and confirmed zero duplicate post behavior.

---

## 3. Human Review & Quality Assurance Checklist

- [x] Every dependency verified for commercial compatibility (no AGPL libraries in shipped JavaScript packages).
- [x] Zero hardcoded API keys, tokens, or private secrets in repository files.
- [x] Prisma database schema adheres to PostgreSQL best practices with composite uniqueness on `(url, platform_key)`.
- [x] Health (`GET /health`) and readiness (`GET /ready`) conform to cloud-native 12-factor application standards.
- [x] Error format strictly conforms to `{ error: { code, message, retryable, details } }`.
