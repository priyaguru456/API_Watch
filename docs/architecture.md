# APIWatch Architecture & Design Specifications

APIWatch is a multi-tenant API reliability, observability, and uptime monitoring platform designed from the ground up for strict data isolation, defense-in-depth security, and high reliability.

---

## 1. Monorepo Architecture

The repository is structured as an npm workspaces monorepo:

```text
APIWatch/
├── apps/
│   ├── api/                   # Express HTTP API: Auth, RBAC, Custom Roles, API Keys, Audit Logs
│   ├── web/                   # React 19 + Vite + Tailwind dashboard (Planned)
│   ├── worker/                # BullMQ queue processor for scheduled checks via ssrf-guard
│   └── ingest/                # High-throughput check result & telemetry ingestion service
├── packages/
│   ├── db/                    # Prisma ORM schema, PostgreSQL 16 RLS policies, least-privilege app role
│   ├── shared/                # Zod schemas, typed env loader, redaction, error hierarchy
│   ├── ssrf-guard/            # Hardened outbound HTTP client preventing SSRF & DNS rebinding
│   ├── vault/                 # Envelope encryption (AES-256-GCM), key rotation service & CLI
│   └── evidence/              # Cryptographic hash chains (SHA-256) & incident snapshot proofs
├── docs/                      # Architectural & security documentation
└── docker-compose.yml         # Local development infrastructure (PostgreSQL 16, Redis 7)
```

---

## 2. Multi-Tenant Isolation: Defense-in-Depth

APIWatch implements multi-tenant isolation across two independent layers:

### Layer 1: Application-Level Scoping

- All incoming requests resolve the tenant organization via `resolveOrg` middleware.
- Membership is verified against `db.membership`.
- Minimum role rank (`OWNER`, `ADMIN`, `ENGINEER`, `VIEWER`) or custom role permissions are enforced by `requireRole` and `requirePermission`.
- Every Prisma query explicitly scopes by `where: { organizationId }`.

### Layer 2: PostgreSQL 16 Row-Level Security (RLS)

- Tenant tables (`OrganizationKey`, `Membership`, `CustomRole`, `Invitation`, `ApiKey`, `AuditLog`, `Monitor`, `CheckResult`, `Incident`) enable RLS with `FORCE ROW LEVEL SECURITY`.
- RLS policies read `current_setting('app.org_id', true)`:
  ```sql
  CREATE POLICY tenant_isolation_policy ON "Monitor"
    FOR ALL
    TO apiwatch_app
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
    WITH CHECK (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
  ```
- Application queries run under the unprivileged `apiwatch_app` role (`NOBYPASSRLS`).
- Prisma client extension `withTenantTransaction(client, orgId, async (tx) => ...)` sets `SET LOCAL app.org_id = ...` per transaction.
- **Guarantee:** Even if an application developer removes the `where: { organizationId }` clause, cross-tenant reads and mutations are blocked at the database engine level.

---

## 3. Cryptography & Secrets Management (`packages/vault`)

- **Envelope Encryption:** Secrets (e.g. monitor auth tokens, headers, webhook secrets) are encrypted using AES-256-GCM with a 96-bit random IV and 128-bit authentication tag.
- **Payload Format:** `vault:v<version>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
- **Key Hierarchy:** An organization-level Data Encryption Key (DEK) is generated per organization and protected by a Master Key (KEK).
- **Key Rotation:** Key rotation service rotates DEKs to a new version without downtime, supporting background secret re-encryption.
- **Zero Leakage:** Raw secrets and encrypted ciphertext are systematically redacted before writing to audit logs or returning to API clients.

---

## 4. SSRF Defense Architecture (`packages/ssrf-guard`)

Outbound monitor probes execute exclusively through `@apiwatch/ssrf-guard` (`safeRequest`):

- **Protocol Restriction:** Only `http:` and `https:` schemes allowed.
- **DNS Resolution & Canonicalization:** Custom DNS lookup directly validates all resolved A/AAAA records.
- **IP Format Normalization:** Detects and normalizes decimal integer, hex, octal, and dotted-octal IP encodings.
- **IP Blacklisting:** Rejects IPv4 loopback (`127.0.0.0/8`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`, `fe80::/10`), CGNAT (`100.64.0.0/10`), multicast (`224.0.0.0/4`), broadcast, and IPv6 unique local/loopback/mapped ranges.
- **Anti-DNS Rebinding:** Pins the validated IP address for the TCP/TLS connection; the hostname is passed via the `Host` header and TLS SNI.
- **Redirect Revalidation:** Each HTTP redirect (max 5) triggers a full DNS and IP validation cycle before following.
- **Resource Protection:** Enforces streaming byte limits (`maxResponseBytes`) and connection timeouts to defeat slow-loris attacks and oversized response memory exhaustion.

---

## 5. Audit Logging & Immutable Evidence

- **Comprehensive Auditing:** All authentication attempts, 2FA operations, role changes, API key issuance/revocation, and configuration updates are written to `AuditLog`.
- **Tamper Evidence (`packages/evidence`):** Generates cryptographic hash chains (SHA-256) and HMAC incident snapshot proofs, providing verifiable proof of monitor downtime and SLA breaches for compliance.

---

## 6. Feature Status & Roadmap

| Component                        | Status   | Description                                                                           |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Monorepo Skeleton & Tooling      | Complete | npm workspaces, Vitest, ESLint, Docker Compose                                        |
| Database & PostgreSQL RLS        | Complete | Prisma schemas, UUID PKs, native enums, RLS policies, least-privilege role            |
| Authentication & RBAC            | Complete | Argon2id, rotating refresh tokens, CSRF, TOTP 2FA, email verification, password reset |
| Custom Roles & API Keys          | Complete | Granular permissions, hashed API keys (`ak_live_...`), scopes                         |
| SSRF Guard & Outbound Probes     | Complete | Anti-SSRF, DNS rebinding protection, IP normalization, redirects                      |
| Secrets Vault                    | Complete | AES-256-GCM envelope encryption, key rotation CLI & service                           |
| Cryptographic Evidence           | Complete | SHA-256 evidence hash chains, HMAC incident proofs                                    |
| Telemetry Ingest App             | Complete | Express telemetry ingestion pipeline                                                  |
| React 19 Web Dashboard           | Planned  | Next-gen UI with TanStack Query, Recharts, and Tailwind                               |
| Distributed Multi-Region Probes  | Planned  | Worker agents probing from AWS, GCP, and Azure edge locations                         |
| Alerting & Incident Integrations | Planned  | PagerDuty, Slack, Opsgenie, and custom webhook dispatchers                            |
| Automated SLA Breach Prediction  | Planned  | Anomaly detection and statistical forecasting on check latencies                      |
