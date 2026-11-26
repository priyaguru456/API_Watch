import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for AES-GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const VERSION_PREFIX = 'v1';

/**
 * Resolves a 32-byte encryption key (64 hex characters).
 * @param {string} [providedKey]
 * @returns {Buffer}
 */
function resolveKey(providedKey) {
  const key =
    providedKey ||
    process.env.ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (!key) {
    throw new Error(
      'Vault error: No encryption key provided and ENCRYPTION_KEY env var is not set'
    );
  }
  if (typeof key !== 'string' || key.length !== 64) {
    throw new Error('Vault error: Encryption key must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypts a sensitive plaintext string using AES-256-GCM.
 * Output format: v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 *
 * @param {string} plaintext
 * @param {string} [hexKey] Optional 64-char hex key. Defaults to process.env.ENCRYPTION_KEY.
 * @returns {string} Encrypted ciphertext string with integrity tag
 */
export function encryptSecret(plaintext, hexKey) {
  if (plaintext === undefined || plaintext === null || typeof plaintext !== 'string') {
    throw new TypeError('Vault error: Plaintext must be a string');
  }

  const keyBuffer = resolveKey(hexKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a payload encrypted by encryptSecret().
 *
 * @param {string} encryptedPayload format: v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
 * @param {string} [hexKey] Optional 64-char hex key. Defaults to process.env.ENCRYPTION_KEY.
 * @returns {string} Decrypted plaintext
 */
export function decryptSecret(encryptedPayload, hexKey) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new TypeError('Vault error: Encrypted payload must be a non-empty string');
  }

  const parts = encryptedPayload.split(':');
  let ivHex, authTagHex, encryptedHex;

  if (parts.length === 4 && parts[0] === VERSION_PREFIX) {
    [, ivHex, authTagHex, encryptedHex] = parts;
  } else if (parts.length === 3) {
    [ivHex, authTagHex, encryptedHex] = parts;
  } else {
    throw new Error(
      'Vault error: Invalid ciphertext format. Expected [v1:]<iv>:<authTag>:<ciphertext>'
    );
  }

  const keyBuffer = resolveKey(hexKey);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Masks a sensitive secret (e.g. API key, token, or password) for safe display.
 * Never outputs more than a tiny prefix/suffix.
 *
 * @param {string} str
 * @returns {string}
 */
export function maskSecret(str) {
  if (!str || typeof str !== 'string') return '******';
  if (str.length <= 8) return '******';
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

/**
 * Generates a cryptographically secure 256-bit encryption key in hex format.
 * @returns {string} 64-character hex string
 */
export function generateVaultKey() {
  return crypto.randomBytes(32).toString('hex');
}
