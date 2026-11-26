import crypto from 'node:crypto';
import { EnvMasterKeyProvider } from './master-key-provider.js';
import { MemoryKeyStore, PrismaKeyStore } from './key-store.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit tag
const DEK_BYTES = 32; // 256 bits

/**
 * VaultService: AES-256-GCM Envelope Encryption service with per-org data key,
 * master key from KMS-ready interface, key versioning, and key rotation.
 */
export class VaultService {
  /**
   * @param {object} [options]
   * @param {import('./master-key-provider.js').MasterKeyProvider} [options.masterKeyProvider]
   * @param {import('./key-store.js').KeyStore} [options.keyStore]
   * @param {import('@prisma/client').PrismaClient} [options.db]
   */
  constructor(options = {}) {
    this.masterKeyProvider = options.masterKeyProvider || new EnvMasterKeyProvider();
    if (options.keyStore) {
      this.keyStore = options.keyStore;
    } else if (options.db) {
      this.keyStore = new PrismaKeyStore(options.db);
    } else {
      this.keyStore = new MemoryKeyStore();
    }
    this.db = options.db || null;

    // In-memory cache for unwrapped DEKs to avoid frequent unwrapping:
    // key: `${orgId}:${version}` -> Buffer
    this.dekCache = new Map();
  }

  /**
   * Retrieves or creates the active Data Encryption Key (DEK) for the given organization.
   * Envelope-encrypts the new DEK using the active Master Key if one doesn't exist.
   *
   * @param {string} organizationId
   * @returns {Promise<{ dek: Buffer; version: number; record: object }>}
   */
  async getOrCreateActiveKey(organizationId) {
    if (!organizationId || typeof organizationId !== 'string') {
      throw new Error('Organization ID is required for key resolution');
    }

    let activeKeyRecord = await this.keyStore.getActiveKey(organizationId);

    if (!activeKeyRecord) {
      // Generate initial per-org data key (DEK)
      const rawDek = crypto.randomBytes(DEK_BYTES);
      const activeMasterKeyId = this.masterKeyProvider.getActiveKeyId();
      const { keyId, encryptedKey } = await this.masterKeyProvider.encryptDataKey(
        rawDek,
        activeMasterKeyId
      );

      activeKeyRecord = await this.keyStore.saveKey({
        organizationId,
        keyVersion: 1,
        encryptedKey,
        masterKeyId: keyId,
        algorithm: ALGORITHM,
        status: 'ACTIVE',
      });

      this.dekCache.set(`${organizationId}:1`, rawDek);
      return { dek: rawDek, version: 1, record: activeKeyRecord };
    }

    // Check DEK cache
    const cacheKey = `${organizationId}:${activeKeyRecord.keyVersion}`;
    let rawDek = this.dekCache.get(cacheKey);

    if (!rawDek) {
      // Unwrap DEK with Master Key
      rawDek = await this.masterKeyProvider.decryptDataKey(
        activeKeyRecord.encryptedKey,
        activeKeyRecord.masterKeyId
      );
      this.dekCache.set(cacheKey, rawDek);
    }

    return {
      dek: rawDek,
      version: activeKeyRecord.keyVersion,
      record: activeKeyRecord,
    };
  }

  /**
   * Retrieves a specific version of unwrapped DEK for an organization.
   * @param {string} organizationId
   * @param {number} version
   * @returns {Promise<Buffer>}
   */
  async getDekForVersion(organizationId, version) {
    const cacheKey = `${organizationId}:${version}`;
    const cached = this.dekCache.get(cacheKey);
    if (cached) return cached;

    const record = await this.keyStore.getKey(organizationId, version);
    if (!record) {
      throw new Error(`Key version ${version} not found for organization "${organizationId}"`);
    }

    const unwrappedDek = await this.masterKeyProvider.decryptDataKey(
      record.encryptedKey,
      record.masterKeyId
    );
    this.dekCache.set(cacheKey, unwrappedDek);
    return unwrappedDek;
  }

  /**
   * Encrypts plaintext under the organization's active per-org data key using AES-256-GCM.
   * Returns a versioned envelope string:
   *   vault:v<keyVersion>:<ivHex>:<authTagHex>:<ciphertextHex>
   *
   * @param {string} organizationId
   * @param {string|object|Buffer} plaintext
   * @returns {Promise<string>}
   */
  async encrypt(organizationId, plaintext) {
    if (plaintext === undefined || plaintext === null) {
      throw new Error('Plaintext data cannot be null or undefined');
    }

    const dataToEncrypt =
      typeof plaintext === 'object' && !Buffer.isBuffer(plaintext)
        ? JSON.stringify(plaintext)
        : String(plaintext);

    const { dek, version } = await this.getOrCreateActiveKey(organizationId);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dek, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const ciphertext = Buffer.concat([cipher.update(dataToEncrypt, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `vault:v${version}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
  }

  /**
   * Decrypts an envelope-encrypted payload.
   * Expects format: vault:v<keyVersion>:<ivHex>:<authTagHex>:<ciphertextHex>
   *
   * @param {string} organizationId
   * @param {string} encryptedPayload
   * @returns {Promise<string>} Plaintext string
   */
  async decrypt(organizationId, encryptedPayload) {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new Error('Encrypted payload must be a non-empty string');
    }

    if (!encryptedPayload.startsWith('vault:v')) {
      throw new Error('Invalid vault ciphertext format: Missing "vault:v" header');
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 5) {
      throw new Error(
        'Invalid vault ciphertext format. Expected vault:v<version>:<iv>:<authTag>:<ciphertext>'
      );
    }

    const versionStr = parts[1].slice(1); // remove 'v' prefix
    const keyVersion = parseInt(versionStr, 10);
    if (Number.isNaN(keyVersion)) {
      throw new Error(`Invalid key version in ciphertext: "${versionStr}"`);
    }

    const ivHex = parts[2];
    const authTagHex = parts[3];
    const cipherHex = parts[4];

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');

    const dek = await this.getDekForVersion(organizationId, keyVersion);

    const decipher = crypto.createDecipheriv(ALGORITHM, dek, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  /**
   * Rotates the Data Encryption Key (DEK) for an organization.
   * 1. Marks current ACTIVE key as RETIRED.
   * 2. Generates a new 256-bit DEK.
   * 3. Wraps the new DEK under the active Master Key (KEK).
   * 4. Stores the new key version with status ACTIVE.
   * 5. If options.reencrypt is true, re-encrypts all encrypted monitors for this org.
   *
   * @param {string} organizationId
   * @param {object} [options]
   * @param {boolean} [options.reencrypt=false]
   * @param {import('@prisma/client').PrismaClient} [options.db]
   * @returns {Promise<{ organizationId: string; previousVersion: number; newVersion: number; reencryptedCount: number }>}
   */
  async rotateOrgKey(organizationId, options = {}) {
    if (!organizationId) {
      throw new Error('Organization ID is required for key rotation');
    }

    const db = options.db || this.db;
    const currentActive = await this.keyStore.getActiveKey(organizationId);
    const previousVersion = currentActive ? currentActive.keyVersion : 0;
    const newVersion = previousVersion + 1;

    // Retire old active key if exists
    if (currentActive) {
      await this.keyStore.updateKeyStatus(organizationId, currentActive.keyVersion, 'RETIRED');
    }

    // Generate and envelope-encrypt new DEK
    const newRawDek = crypto.randomBytes(DEK_BYTES);
    const masterKeyId = this.masterKeyProvider.getActiveKeyId();
    const { keyId, encryptedKey } = await this.masterKeyProvider.encryptDataKey(
      newRawDek,
      masterKeyId
    );

    await this.keyStore.saveKey({
      organizationId,
      keyVersion: newVersion,
      encryptedKey,
      masterKeyId: keyId,
      algorithm: ALGORITHM,
      status: 'ACTIVE',
    });

    // Cache new unwrapped DEK
    this.dekCache.set(`${organizationId}:${newVersion}`, newRawDek);

    let reencryptedCount = 0;

    // Re-encrypt monitors if requested and db is provided
    if (options.reencrypt && db && db.monitor) {
      const monitors = await db.monitor.findMany({
        where: {
          organizationId,
        },
      });

      for (const monitor of monitors) {
        if (monitor.encryptedAuth && monitor.encryptedAuth.startsWith('vault:v')) {
          try {
            // Decrypt with previous version DEK
            const decryptedAuth = await this.decrypt(organizationId, monitor.encryptedAuth);
            // Re-encrypt with new active version DEK
            const newEncryptedAuth = await this.encrypt(organizationId, decryptedAuth);

            await db.monitor.update({
              where: { id: monitor.id },
              data: { encryptedAuth: newEncryptedAuth },
            });
            reencryptedCount++;
          } catch (err) {
            // Log or propagate
            console.error(`Failed to re-encrypt monitor ${monitor.id}: ${err.message}`);
          }
        }
      }
    }

    return {
      organizationId,
      previousVersion,
      newVersion,
      reencryptedCount,
    };
  }

  /**
   * Rotates keys for all organizations in the database.
   * @param {object} [options]
   * @param {boolean} [options.reencrypt=false]
   * @param {import('@prisma/client').PrismaClient} [options.db]
   */
  async rotateAllKeys(options = {}) {
    const db = options.db || this.db;
    if (!db || !db.organization) {
      throw new Error('Database client with organization model is required to rotate all keys');
    }

    const orgs = await db.organization.findMany({
      select: { id: true, name: true },
    });

    const results = [];
    for (const org of orgs) {
      const result = await this.rotateOrgKey(org.id, {
        reencrypt: options.reencrypt ?? true,
        db,
      });
      results.push({ ...result, orgName: org.name });
    }

    return results;
  }
}

/**
 * Creates a configured VaultService instance.
 * @param {object} [options]
 * @returns {VaultService}
 */
export function createVaultService(options = {}) {
  return new VaultService(options);
}
