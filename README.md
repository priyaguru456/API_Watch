# APIWatch — Multi-Tenant API Monitoring and Reliability Platform

APIWatch is a developer-centric, multi-tenant API monitoring, uptime tracking, and reliability platform. It continuously probes HTTP/HTTPS endpoints, tracks latency percentiles, detects outages, manages incident lifecycles, and triggers real-time alerts.

---

## Architecture & Monorepo Layout

APIWatch is structured as an npm workspaces monorepo:

```text
APIWatch/
├── apps/
│   ├── api/                   # Express HTTP API with Pino logging & request IDs
│   ├── web/                   # React 19 + Vite dashboard application
│   └── worker/                # BullMQ queue processor for scheduled checks
├── packages/
│   ├── db/                    # Prisma ORM client with PostgreSQL 16 schema
│   ├── shared/                # Zod-validated typed env loader, errors, AES-256-GCM crypto
│   └── ssrf-guard/            # Outbound HTTP monitoring client with SSRF & DNS rebinding protection
├── docker-compose.yml         # PostgreSQL 16 (named volume, healthcheck) + Redis 7
├── .env.example               # Root environment variable template
├── vitest.config.js           # Monorepo-wide Vitest configuration
├── eslint.config.js           # ESLint 9 configuration
└── package.json               # Root npm workspaces configuration
```

---

## Architectural Rules & Guarantees

1. **Multi-Tenant Isolation:** Every database query and worker job is strictly scoped by `organizationId`. Client-supplied IDs are never trusted without tenant verification.
2. **Postgres 16 Features:** Uses JSONB for flexible check configs and assertion rules, native enums (`MembershipRole`, `HttpMethod`, `MonitorStatus`, `IncidentStatus`), and raw SQL (`$queryRaw`) for rollups and percentiles.
3. **Zod Validation & Central Error Handling:** All inputs are validated with Zod schemas. Centralized error handling guarantees stack traces are **never leaked** in client API responses.
4. **Encryption at Rest:** Secrets and sensitive authentication headers are encrypted at rest with AES-256-GCM and never returned in API payloads or printed in logs.
5. **SSRF Guarding:** All outbound network probes route strictly through `@apiwatch/ssrf-guard`, preventing access to private IPv4/IPv6 subnets (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, link-local, AWS/cloud metadata 169.254.169.254) with IP pinning against DNS rebinding.

---

## Authentication & Multi-Tenancy Architecture

### 1. Password Hashing

- Passwords hashed using **Argon2id** (memory: 19456 KB, iterations: 2, parallelism: 1).
- Fallback to secure Node.js native `crypto.scrypt` when native compilation is absent.

### 2. Token Lifecycle & Rotation

- **Access Token:** Short-lived JWT (15 minutes), containing `{ sub: userId, email, jti: uuid }`.
- **Refresh Token:** Cryptographically strong token stored hashed (SHA-256) in the database with an assigned `family` UUID.
- **HTTP-Only Secure Cookie:** Delivered via `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax; Path=/; Secure`.
- **Rotation & Replay Detection:** On each `/api/v1/auth/refresh`, the previous token is invalidated, and a new token in the same family is issued. If a revoked token is re-submitted (indicating token theft or replay), the entire token family is immediately revoked.
- **CSRF Protection:** Cookie-based operations enforce double-submit verification matching the `csrf_token` cookie against the `X-CSRF-Token` request header.
- **Login Rate Limiting:** Sliding window limiter protects `/api/v1/auth/login` (default max 5 attempts per 15 minutes per IP + email).

### 3. Tenant RBAC & Middleware Guards

- **Roles:** `OWNER` (rank 4) > `ADMIN` (rank 3) > `ENGINEER` (rank 2) > `VIEWER` (rank 1).
- `resolveOrg`: Scopes requests by verifying user's active membership in `organizationId` (from route params, query, or `X-Organization-Id` header). Returns 403 Forbidden for cross-tenant access.
- `requireRole(...roles)`: Verifies minimum role or explicit membership rank before mutation.
- **Invite Member Flow:** `OWNER` or `ADMIN` creates an invitation (`POST /api/v1/orgs/:organizationId/invites`), and the invited user accepts it (`POST /api/v1/invites/:token/accept`).

---

## Prerequisites

- **Node.js:** v20.0.0+ (Tested on Node 26)
- **npm:** v10+ (Workspaces enabled)
- **Docker & Docker Compose:** Docker Compose v2+

---

## Quickstart

### 1. Clone & Configure Environment

```bash
cp .env.example .env
```

Verify or adjust environment variables in `.env` (defaults work out of the box with Docker Compose):

```ini
PORT=5000
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/apiwatch?schema=public
REDIS_URL=redis://localhost:6379
JWT_SECRET=apiwatch_dev_super_secret_jwt_key_at_least_32_characters_long
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### 2. Start Infrastructure Containers

Start PostgreSQL 16 and Redis 7 in the background:

```bash
docker compose up -d
```

Verify services and healthchecks:

```bash
docker compose ps
```

### 3. Install Dependencies & Generate Prisma Client

```bash
npm install
npm run db:generate
npm run db:push
```

### 4. Run Development Servers

Run services individually or concurrently:

```bash
# Run Express API server (starts on http://localhost:5000)
npm run dev:api

# Run BullMQ background worker
npm run dev:worker

# Run React Vite frontend (starts on http://localhost:5173)
npm run dev:web
```

---

## Health & Readiness Probes

### Liveness Probe (`/health` and `/api/v1/health`)

Returns immediate HTTP 200 indicating the API service process is up.

```bash
curl -i http://localhost:5000/health
```

### Readiness Probe (`/ready` and `/api/v1/ready`)

Verifies live connectivity to both PostgreSQL (via `SELECT 1`) and Redis (via `PING`).

```bash
curl -i http://localhost:5000/ready
```

**Response when healthy (200 OK):**

```json
{
  "status": "ready",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 2
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 1
    }
  },
  "timestamp": "2026-11-26T12:00:00.000Z"
}
```

---

## API Endpoints Reference

### Authentication

- `POST /api/v1/auth/register` - Register user & default organization (role `OWNER`).
- `POST /api/v1/auth/login` - Authenticate, returns access token, sets rotating refresh token cookie.
- `POST /api/v1/auth/refresh` - Rotates refresh token in cookie, issues new access token (CSRF protected).
- `POST /api/v1/auth/logout` - Revokes session and clears cookie.

### Organizations & RBAC

- `GET /api/v1/orgs/:organizationId/members` - List organization members.
- `POST /api/v1/orgs/:organizationId/invites` - Invite a new member (`OWNER` or `ADMIN`).
- `POST /api/v1/invites/:token/accept` - Accept invitation and join organization.
- `GET /api/v1/orgs/:organizationId/monitors` - List monitors scoped strictly by organization.
- `POST /api/v1/orgs/:organizationId/monitors` - Create monitor (`OWNER`, `ADMIN`, `ENGINEER`).

---

## Testing

APIWatch includes comprehensive unit and integration test suites covering all security and tenant boundaries:

```bash
# Run all Vitest suites (42+ tests passing)
npm test

# Run tests in watch mode
npm run test:watch
```

Test coverage includes:

- Multi-tenant boundary isolation (proving User A cannot read or mutate Org B data).
- Rotating refresh token replay detection and token family revocation.
- CSRF protection for cookie flows.
- Argon2 password hashing and login rate limiting.
- Liveness and readiness probes under both healthy and degraded conditions.
- Strict stack-trace suppression across all 4xx/5xx error responses.
- SSRF guard IPv4/IPv6 private IP filtering and DNS rebinding prevention.

---

## Code Quality & Formatting

```bash
# Lint with ESLint 9
npm run lint

# Check formatting with Prettier
npm run format:check

# Format codebase
npm run format
```
