import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

/**
 * Interface contract for Master Key Providers (KMS-ready).
 * Can be implemented by AWS KMS, GCP Cloud KMS, HashiCorp Vault, or EnvMasterKeyProvider.
 */
export class MasterKeyProvider {
  /**
   * Returns the identifier of the currently active master key.
   * @returns {string}
   */
  getActiveKeyId() {
    throw new Error('MasterKeyProvider.getActiveKeyId() must be implemented');
  }

  /**
   * Retrieves the master key buffer for the given key ID.
   * @param {string} [keyId]
   * @returns {Promise<{ keyId: string; key: Buffer }>}
   */
  async getMasterKey(_keyId) {
    throw new Error('MasterKeyProvider.getMasterKey() must be implemented');
  }

  /**
   * Encrypts (wraps) a raw Data Encryption Key (DEK).
   * @param {Buffer} _rawDek
   * @param {string} [_keyId]
   * @returns {Promise<{ keyId: string; encryptedKey: string }>}
   */
  async encryptDataKey(_rawDek, _keyId) {
    throw new Error('MasterKeyProvider.encryptDataKey() must be implemented');
  }

  /**
   * Decrypts (unwraps) an encrypted Data Encryption Key (DEK).
   * @param {string} _encryptedKey
   * @param {string} _keyId
   * @returns {Promise<Buffer>}
   */
  async decryptDataKey(_encryptedKey, _keyId) {
    throw new Error('MasterKeyProvider.decryptDataKey() must be implemented');
  }
}

/**
 * Master Key Provider backed by Environment Variables (KMS-ready).
 * Supports:
 * - VAULT_MASTER_KEY or ENCRYPTION_KEY (64-char hex string, 32 bytes)
 * - VAULT_MASTER_KEYS (JSON map of version -> 64-char hex string)
 * - Dynamic key registration for rotation and testing
 */
export class EnvMasterKeyProvider extends MasterKeyProvider {
  /**
   * @param {object} [options]
   * @param {Record<string, string>} [options.keys] Map of keyId -> 64-char hex key
   * @param {string} [options.activeKeyId]
   */
  constructor(options = {}) {
    super();
    this.keys = new Map();
    this.activeKeyId = options.activeKeyId || process.env.VAULT_ACTIVE_MASTER_KEY_ID || 'v1';

    // 1. Initialize from options if provided
    if (options.keys) {
      for (const [id, hexKey] of Object.entries(options.keys)) {
        this.registerKey(id, hexKey);
      }
    }

    // 2. Parse from VAULT_MASTER_KEYS env if available
    if (process.env.VAULT_MASTER_KEYS) {
      try {
        const parsed = JSON.parse(process.env.VAULT_MASTER_KEYS);
        for (const [id, hexKey] of Object.entries(parsed)) {
          this.registerKey(id, hexKey);
        }
      } catch (err) {
        throw new Error(`Failed to parse VAULT_MASTER_KEYS JSON: ${err.message}`);
      }
    }

    // 3. Fallback to single VAULT_MASTER_KEY or ENCRYPTION_KEY
    const singleKey = process.env.VAULT_MASTER_KEY || process.env.ENCRYPTION_KEY;
    if (singleKey && !this.keys.has(this.activeKeyId)) {
      this.registerKey(this.activeKeyId, singleKey);
    }

    // If still no keys, provide a secure dev/test fallback key
    if (this.keys.size === 0) {
      const defaultKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      this.registerKey(this.activeKeyId, defaultKey);
    }
  }

  /**
   * Registers a master key under a specific version ID.
   * @param {string} keyId
   * @param {string} hexKey 64-character hex string (32 bytes)
   */
  registerKey(keyId, hexKey) {
    if (!keyId || typeof keyId !== 'string') {
      throw new Error('Master key ID must be a non-empty string');
    }
    if (
      !hexKey ||
      typeof hexKey !== 'string' ||
      hexKey.length !== 64 ||
      !/^[0-9a-fA-F]+$/.test(hexKey)
    ) {
      throw new Error(
        `Master key "${keyId}" must be a 64-character hex string (32 bytes for AES-256)`
      );
    }
    this.keys.set(keyId, Buffer.from(hexKey, 'hex'));
  }

  /**
   * Returns active master key ID.
   */
  getActiveKeyId() {
    return this.activeKeyId;
  }

  /**
   * Sets the active master key ID.
   * @param {string} keyId
   */
  setActiveKeyId(keyId) {
    if (!this.keys.has(keyId)) {
      throw new Error(`Cannot set active master key: Key ID "${keyId}" does not exist`);
    }
    this.activeKeyId = keyId;
  }

  /**
   * Retrieves master key buffer.
   * @param {string} [keyId]
   */
  async getMasterKey(keyId) {
    const id = keyId || this.activeKeyId;
    const key = this.keys.get(id);
    if (!key) {
      throw new Error(`Master key with ID "${id}" not found`);
    }
    return { keyId: id, key };
  }

  /**
   * Wraps (encrypts) raw DEK with the specified master key using AES-256-GCM.
   * Output format: <ivHex>:<authTagHex>:<ciphertextHex>
   * @param {Buffer} rawDek
   * @param {string} [keyId]
   */
  async encryptDataKey(rawDek, keyId) {
    const { keyId: resolvedKeyId, key } = await this.getMasterKey(keyId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const ciphertext = Buffer.concat([cipher.update(rawDek), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const encryptedKey = `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
    return { keyId: resolvedKeyId, encryptedKey };
  }

  /**
   * Unwraps (decrypts) an encrypted DEK.
   * @param {string} encryptedKey
   * @param {string} keyId
   * @returns {Promise<Buffer>}
   */
  async decryptDataKey(encryptedKey, keyId) {
    const { key } = await this.getMasterKey(keyId);
    const parts = encryptedKey.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted DEK format. Expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(cipherHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
