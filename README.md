# APIWatch — Multi-Tenant API Monitoring and Reliability Platform

APIWatch is a developer-centric, multi-tenant API monitoring, uptime tracking, and reliability platform. It continuously probes HTTP/HTTPS endpoints, tracks latency percentiles, detects outages, manages incident lifecycles, and triggers real-time alerts.

---

## Architecture & Monorepo Layout

APIWatch is structured as an npm workspaces monorepo:

```text
APIWatch/
├── apps/
│   ├── api/                   # Express HTTP API: Auth, RBAC, Custom Roles, API Keys, Audit Logs
│   ├── web/                   # React 19 + Vite + Tailwind dashboard (Planned)
│   ├── worker/                # BullMQ queue processor for scheduled checks
│   └── ingest/                # High-throughput check result & telemetry ingestion service
├── packages/
│   ├── db/                    # Prisma ORM, PostgreSQL 16 RLS policies, least-privilege role
│   ├── shared/                # Zod-validated schemas, typed env loader, redaction, error hierarchy
│   ├── ssrf-guard/            # Outbound HTTP client with SSRF, DNS rebinding & adversarial defense
│   ├── vault/                 # AES-256-GCM envelope encryption, key rotation service & CLI
│   └── evidence/              # Cryptographic SHA-256 hash chains & HMAC incident snapshot proofs
├── docs/                      # Architectural & security specifications
├── docker-compose.yml         # PostgreSQL 16 (named volume, healthcheck) + Redis 7
├── .env.example               # Root environment variable template
├── vitest.config.js           # Monorepo-wide Vitest configuration
├── eslint.config.js           # ESLint 9 configuration with restricted imports
└── package.json               # Root npm workspaces configuration
```

---

## Architectural Rules & Guarantees

1. **Multi-Tenant Isolation:** Every database query and worker job is strictly scoped by `organizationId`. Client-supplied IDs are never trusted without tenant verification.
2. **PostgreSQL 16 Row-Level Security (RLS):** Enforced natively on all tenant tables using `current_setting('app.org_id')` and a least-privilege `apiwatch_app` role without `BYPASSRLS`. Tests prove cross-tenant reads are blocked even if application-layer filters are deliberately omitted.
3. **Zod Validation & Central Error Handling:** All inputs are validated with Zod schemas. Centralized error handling guarantees stable error codes and **never leaks stack traces** in client API responses.
4. **Envelope Encryption at Rest (`@apiwatch/vault`):** Secrets and sensitive authentication headers are encrypted at rest with AES-256-GCM (`vault:v1:...`) and never returned in API payloads or printed in logs. Supports zero-downtime key rotation.
5. **SSRF Guarding (`@apiwatch/ssrf-guard`):** All outbound network probes route strictly through `@apiwatch/ssrf-guard`, preventing access to private IPv4/IPv6 subnets (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, link-local, AWS/cloud metadata 169.254.169.254), normalizing decimal/hex/octal encodings, pinning resolved IPs against DNS rebinding, and strictly revalidating redirects.
6. **Cryptographic Incident Evidence (`@apiwatch/evidence`):** Generates immutable SHA-256 evidence hash chains and HMAC incident snapshot proofs for verifiable SLA compliance.

---

## Authentication & Security Architecture

### 1. Password Hashing & 2FA

- Passwords hashed using **Argon2id** (memory: 19456 KB, iterations: 2, parallelism: 1).
- Optional **TOTP 2FA** (RFC 6238, 30s window, dynamic truncation) with setup, verify, enable, challenge, and disable flows.
- Email verification and secure password reset token flows.

### 2. Token Lifecycle & Rotation

- **Access Token:** Short-lived JWT (15 minutes), containing `{ sub: userId, email, jti: uuid }`.
- **Refresh Token:** Cryptographically strong token stored hashed (SHA-256) in the database with an assigned `family` UUID.
- **HTTP-Only Secure Cookie:** Delivered via `Set-Cookie: refresh_token=...; HttpOnly; SameSite=Lax; Path=/; Secure`.
- **Rotation & Replay Detection:** On each `/api/v1/auth/refresh`, the previous token is invalidated, and a new token in the same family is issued. If a revoked token is re-submitted, the entire token family is immediately revoked.
- **CSRF Protection:** Cookie-based operations enforce double-submit verification matching the `csrf_token` cookie against the `X-CSRF-Token` request header.
- **Login Rate Limiting:** Sliding window limiter protects `/api/v1/auth/login` against brute force.

### 3. Tenant RBAC & Middleware Guards

- **Standard Roles:** `OWNER` (rank 4) > `ADMIN` (rank 3) > `ENGINEER` (rank 2) > `VIEWER` (rank 1).
- **Custom Roles Table:** Supports organization-defined roles with granular permission arrays (e.g. `monitors:create`, `members:invite`, `*` wildcards).
- **Hashed API Keys:** `ak_live_...` format with SHA-256 hash lookup, granular scopes, expiration, and asynchronous last-used tracking. Plain secret is shown only once at creation.
- `resolveOrg`: Scopes requests by verifying user's active membership or API key in `organizationId`. Returns 403 Forbidden for cross-tenant access.
- `requireRole(...roles)`: Verifies minimum standard role rank.
- `requirePermission(...permissions)`: Verifies granular permissions against standard roles, custom roles, or API key scopes.
- **Invite Member Flow:** `OWNER` or `ADMIN` creates an invitation (`POST /api/v1/orgs/:organizationId/invites`), supporting standard and custom roles, accepted via `POST /api/v1/invites/:token/accept`.

### 4. Audit Logging & Redaction

- Centralized audit service records every authentication, 2FA, invitation, role mutation, and monitor action.
- Deep recursive redaction scrubs all passwords, tokens, API keys, and sensitive headers before storage.
- Search API with filters by action, actor, entityType, entityId, and date range.
- CSV and JSON export capabilities for compliance and forensics.

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

Verify or adjust environment variables in `.env`:

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

# Run Telemetry Ingestion service
npm run dev:ingest

# Run React Vite frontend (Planned)
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

---

## API Endpoints Reference

### Authentication & 2FA

- `POST /api/v1/auth/register` - Register user & default organization (`OWNER`).
- `POST /api/v1/auth/login` - Authenticate, supports TOTP 2FA challenge, sets rotating refresh token cookie.
- `POST /api/v1/auth/2fa/setup` - Generate TOTP secret & QR data URL.
- `POST /api/v1/auth/2fa/enable` - Verify code and enable TOTP 2FA.
- `POST /api/v1/auth/2fa/verify` - Complete 2FA login challenge with code.
- `POST /api/v1/auth/2fa/disable` - Disable TOTP 2FA with current password.
- `POST /api/v1/auth/refresh` - Rotates refresh token in cookie, issues new access token (CSRF protected).
- `POST /api/v1/auth/logout` - Revokes session and clears cookie.
- `POST /api/v1/auth/verify-email/request` & `/confirm` - Email verification flow.
- `POST /api/v1/auth/password-reset/request` & `/confirm` - Password reset flow.

### Organizations, RBAC & API Keys

- `GET /api/v1/orgs/:organizationId/members` - List organization members.
- `POST /api/v1/orgs/:organizationId/invites` - Invite a new member (`OWNER` or `ADMIN`).
- `POST /api/v1/invites/:token/accept` - Accept invitation and join organization.
- `GET /api/v1/orgs/:organizationId/roles` & `POST ...` - Manage custom roles.
- `GET /api/v1/orgs/:organizationId/api-keys` & `POST ...` - Manage hashed API keys.
- `GET /api/v1/orgs/:organizationId/monitors` - List monitors scoped strictly by organization.
- `POST /api/v1/orgs/:organizationId/monitors` - Create monitor (`OWNER`, `ADMIN`, `ENGINEER`).
- `GET /api/v1/orgs/:organizationId/audit-logs` - Query audit logs with filtering.
- `GET /api/v1/orgs/:organizationId/audit-logs/export` - Export audit logs as CSV or JSON (`OWNER`, `ADMIN`).

---

## Testing & Quality Assurance

APIWatch includes comprehensive unit, integration, tenant-isolation, and adversarial test suites:

```bash
# Run all Vitest suites (96 tests passing across 14 suites)
npm test

# Run linter
npm run lint
```

Test coverage includes:

- **Tenant Isolation:** Proves PostgreSQL RLS blocks cross-tenant reads even when app filters are disabled.
- **Adversarial SSRF:** Tests loopbacks, RFC1918, 169.254.169.254, hex/octal/decimal IPs, DNS rebinding, redirect-to-internal, slow-loris, and oversized payloads.
- **Auth & RBAC Matrix:** Argon2id, rotating refresh tokens, 2FA, custom roles, API key authentication, and audit trails.
- **Secrets Safety:** Proves raw credentials and ciphertexts never appear in API responses or logs.

---

## Feature Roadmap

- [x] Multi-Tenant PostgreSQL RLS & Prisma Extension
- [x] Complete Auth Lifecycle (Argon2id, Refresh Tokens, CSRF, TOTP 2FA)
- [x] Custom Roles & Hashed API Keys
- [x] Adversarially Hardened SSRF Guard
- [x] Envelope Encryption & Zero-Downtime Key Rotation
- [x] Cryptographic SLA Evidence Chains
- [x] Audit Logging & Compliance Export
- [ ] React 19 + TanStack Query Web UI _(Planned)_
- [ ] Distributed Multi-Region Probe Workers _(Planned)_
- [ ] PagerDuty, Slack & Webhook Alerting _(Planned)_
- [ ] Automated SLA Anomaly Detection _(Planned)_
