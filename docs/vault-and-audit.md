# APIWatch Vault & Audit Service Architecture

## 1. Envelope Encryption (`packages/vault`)

APIWatch implements multi-tenant envelope encryption using standard **AES-256-GCM** with per-organization Data Encryption Keys (DEKs) wrapped by a Master Key (Key Encryption Key - KEK).

```text
┌────────────────────────────────────────────────────────┐
│ Master Key (KEK) [Environment / KMS-Ready Interface]  │
└──────────────────────────┬─────────────────────────────┘
                           │ Wraps / Unwraps
                           ▼
┌────────────────────────────────────────────────────────┐
│ Per-Organization Data Encryption Key (DEK)             │
│ (256-bit random bytes generated per tenant)            │
└──────────────────────────┬─────────────────────────────┘
                           │ Encrypts / Decrypts
                           ▼
┌────────────────────────────────────────────────────────┐
│ Sensitive Secrets (API Tokens, Passwords, Webhooks)    │
│ Stored format: vault:v<version>:<iv>:<tag>:<ciphertext>│
└────────────────────────────────────────────────────────┘
```

### Key Components

- **`MasterKeyProvider` (KMS-Ready Interface):** Abstract interface providing `getActiveKeyId()`, `getMasterKey()`, `encryptDataKey()`, and `decryptDataKey()`. Ready for drop-in AWS KMS, GCP Cloud KMS, or HashiCorp Vault.
- **`EnvMasterKeyProvider`:** Concrete KMS-ready implementation reading master keys from `VAULT_MASTER_KEY` / `ENCRYPTION_KEY` or versioned JSON map `VAULT_MASTER_KEYS`.
- **`KeyStore` & `PrismaKeyStore`:** Stores tenant encrypted DEKs in PostgreSQL (`organization_keys` table) with key versioning (`keyVersion`), status (`ACTIVE`, `RETIRED`), and timestamps.
- **`VaultService`:** Handles automatic DEK generation, caching of unwrapped DEKs, AES-256-GCM payload encryption, and backward-compatible decryption across all past key versions.

### Ciphertext Wire Format

Envelope-encrypted secrets follow a structured, versioned header:

```text
vault:v<keyVersion>:<iv-hex>:<authTag-hex>:<ciphertext-hex>
```

### Key Rotation

Organizations can rotate their data encryption keys without downtime:

1. Generates a new cryptographically secure 256-bit DEK (`vN+1`).
2. Wraps the new DEK under the active Master Key.
3. Sets the new DEK to `ACTIVE` and marks previous versions as `RETIRED`.
4. Optionally scans and re-encrypts all stored monitors at rest.
5. All previous secret payloads remain decryptable via version history.

#### CLI Usage

```bash
# Rotate key for a specific organization and re-encrypt stored secrets
node ./packages/vault/bin/vault-rotate.js --org <organizationId> --reencrypt

# Rotate keys for all organizations
node ./packages/vault/bin/vault-rotate.js --all --reencrypt
```

---

## 2. Multi-Tenant Audit Service

APIWatch provides an immutable, tenant-scoped audit logging service that records security and lifecycle events.

### Recorded Fields

- **Actor:** User ID, email, and name.
- **Action:** Event identifier (e.g. `monitor.create`, `vault.rotate_key`, `member.invite`).
- **Target:** Entity type and entity ID (e.g. `{ type: 'monitor', id: 'uuid' }`).
- **Network Metadata:** Client IP address and User-Agent.
- **State Changes:** `before` and `after` snapshots. **All secrets are strictly redacted before storage.**
- **Details:** Contextual metadata (also deep-redacted).

### Endpoints

- `GET /api/v1/orgs/:organizationId/audit-logs`
  - Query filters: `action`, `actorId`, `entityType`, `entityId`, `startDate`, `endDate`, `search`.
  - Pagination: `page` (default 1), `limit` (default 20, max 100).
  - RBAC: Accessible by `OWNER`, `ADMIN`, `ENGINEER`, `VIEWER`.
- `GET /api/v1/orgs/:organizationId/audit-logs/export`
  - Formats: `json` or `csv`.
  - RBAC: Accessible by `OWNER` and `ADMIN`.
  - CSV exports format cells with proper CSV quoting and newline escaping.

---

## 3. Pino Log Redaction Serializer

A recursive deep redaction serializer ensures secrets never leak into server stdout or structured logs:

- **Redacted Header Keys:** `authorization`, `cookie`, `x-api-key`, `x-csrf-token`.
- **Redacted Object Keys:** `password`, `token`, `secret`, `apiKey`, `client_secret`, `dek`, `masterKey`, `encryptedAuth`.
- **Redacted String Patterns:**
  - Bearer tokens (`Bearer [REDACTED]`)
  - JWT strings (`[REDACTED_JWT]`)
  - Basic auth headers (`Basic [REDACTED]`)
  - 64-character raw hex keys (`[REDACTED_KEY]`)
  - Vault ciphertexts (`vault:v[REDACTED]`)

---

## 4. Zero Secret Leakage Verification

All features are tested to guarantee secrets never appear in:

1. **API Responses:** Monitor listings omit `encryptedAuth` and return `hasAuth: true`.
2. **Audit Logs:** Before/after state snapshots are sanitized before persistence and export.
3. **Pino Logs:** Request bodies, query parameters, error messages, and log formatters sanitize credentials prior to emission.
