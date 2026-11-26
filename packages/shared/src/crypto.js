import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

/**
 * Encrypts sensitive string data at rest using AES-256-GCM.
 * Output format: <iv-hex>:<authTag-hex>:<ciphertext-hex>
 *
 * @param {string} plaintext
 * @param {string} hexKey 64-char hex string (32 bytes)
 * @returns {string} Encrypted string
 */
export function encrypt(plaintext, hexKey) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)');
  }

  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts encrypted string data produced by encrypt().
 *
 * @param {string} encryptedPayload format: <iv-hex>:<authTag-hex>:<ciphertext-hex>
 * @param {string} hexKey 64-char hex string (32 bytes)
 * @returns {string} Decrypted plaintext
 */
export function decrypt(encryptedPayload, hexKey) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') {
    throw new Error('Payload must be a non-empty string');
  }
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Masks sensitive strings (e.g. API keys, secrets) for safe logging / display.
 * @param {string} str
 * @returns {string}
 */
export function maskSecret(str) {
  if (!str || typeof str !== 'string') return '***';
  if (str.length <= 6) return '******';
  return `${str.slice(0, 3)}...${str.slice(-3)}`;
}
