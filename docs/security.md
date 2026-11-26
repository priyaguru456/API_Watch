# APIWatch Security Threat Model & Defense Specifications

This document outlines the security controls, adversarial defenses, and threat mitigations implemented across APIWatch.

---

## 1. Outbound Network & SSRF Mitigations (`@apiwatch/ssrf-guard`)

### Threat Model

Users can configure arbitrary target URLs for uptime monitoring. An attacker might provide URLs intended to:

- Probe internal infrastructure (e.g. `127.0.0.1`, `10.0.0.1`, `192.168.1.1`).
- Target cloud metadata services (e.g. `169.254.169.254`, `metadata.google.internal`) to steal IAM credentials or instance tokens.
- Execute DNS rebinding attacks where a domain resolves to a public IP during check validation but resolves to `127.0.0.1` during the socket connection.
- Evade blocklists using alternate IP formats (decimal integer `2130706433`, octal `0177.0.0.1`, hex `0x7f.0.0.1`, IPv6-mapped IPv4 `::ffff:127.0.0.1`).
- Perform slow-loris attacks or stream gigabytes of data to exhaust worker memory.

### Defenses Implemented

1. **Canonicalization (`canonicalizeIpv4`):** Parses all octal, hexadecimal, and single-integer DWORD formats into standard dotted-decimal notation prior to evaluation.
2. **Comprehensive Range Filtering:**
   - Loopback: `127.0.0.0/8`, `::1`
   - RFC 1918 Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-Local & Metadata: `169.254.0.0/16`, `fe80::/10`
   - Carrier-Grade NAT: `100.64.0.0/10`
   - Broadcast & Multicast: `224.0.0.0/4`, `255.255.255.255`, `ff00::/8`
   - Documentation & Benchmark: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`, `198.18.0.0/15`
3. **Socket IP Pinning (Anti-DNS Rebinding):** Resolves the target hostname once, validates all resulting IP addresses, and establishes the raw TCP/TLS socket directly to the validated IP. Host header and TLS SNI remain set to the original domain name.
4. **Strict Redirect Revalidation:** Follows at most 5 redirects. Every redirect target is completely re-resolved and re-validated through the full SSRF pipeline. Redirecting from a public endpoint to an internal endpoint (e.g. `302 -> http://169.254.169.254/`) is rejected immediately.
5. **Worker Linter Restrictions:** ESLint explicitly forbids direct usage of `fetch`, `axios`, or standard `http.request` within worker files, guaranteeing all requests route through `safeRequest`.

---

## 2. Multi-Tenant Row-Level Security (PostgreSQL 16)

### Threat Model

A vulnerability in application code (e.g. forgetting `where: { organizationId }` or an IDOR bug) allows User A to view or mutate monitors, API keys, or audit logs belonging to Organization B.

### Defenses Implemented

1. **PostgreSQL RLS Policies:**
   - `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` are enabled on all tenant tables.
   - Policies enforce `organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid`.
2. **Least-Privilege App Role:**
   - Application connections authenticate as `apiwatch_app` (created without `SUPERUSER` or `BYPASSRLS`).
3. **Prisma Client Transaction Extension:**
   - `withTenantTransaction(client, orgId, async (tx) => ...)` executes `SET LOCAL app.org_id = $orgId` at transaction start.
   - Tested and verified: even if application queries specify `where: {}`, cross-tenant rows are invisible and mutations fail.

---

## 3. Cryptography & Secrets Safety (`@apiwatch/vault`)

### Threat Model

- Database dumps or read replicas expose sensitive monitor headers (e.g. `Authorization: Bearer <token>`).
- Application logs or error messages inadvertently include sensitive credentials.

### Defenses Implemented

1. **AES-256-GCM Envelope Encryption:** Encrypts secrets with 96-bit random IVs and authenticated tag verification to prevent ciphertext tampering.
2. **Key Rotation CLI & Service:** Supports rotating organization Data Encryption Keys (DEKs) and re-encrypting stored secrets without downtime.
3. **Automatic Deep Redaction:** `redactSensitiveData` scrubs passwords, API keys, tokens, auth headers, and secrets from all audit logs and error handlers. Raw credentials are never returned in GET responses.

---

## 4. Authentication & Session Security

- **Argon2id Password Hashing:** Memory: 19456 KB, 2 iterations, 1 parallelism, salt length 16 bytes.
- **Rotating Refresh Tokens:** Single-use tokens with replay detection. Submitting a revoked token immediately revokes all tokens within that session family.
- **TOTP 2FA (RFC 6238):** Time-based one-time passwords using SHA-1, 6 digits, 30-second windows with ±1 step drift tolerance.
- **CSRF Defense:** Cookie-based endpoints enforce double-submit CSRF cookie/header matching.
- **Hashed API Keys:** API keys follow format `ak_live_<random_bytes>` and are stored only as SHA-256 hashes. The plain key is displayed to the user exactly once at creation.
- **Central Error Handler:** Formats clean JSON error envelopes with stable error codes (`FORBIDDEN`, `UNAUTHORIZED`, etc.) and strictly suppresses stack traces across all environments.
