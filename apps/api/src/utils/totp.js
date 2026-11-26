import crypto from 'node:crypto';

// Standard Base32 RFC 4648 alphabet
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Buffer to a Base32 string (RFC 4648 without padding).
 * @param {Buffer} buffer
 * @returns {string}
 */
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer.
 * @param {string} base32Str
 * @returns {Buffer}
 */
export function base32Decode(base32Str) {
  const clean = base32Str.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random TOTP secret in Base32.
 * @param {number} [byteLength=20] 160-bit standard secret
 * @returns {string} Base32 encoded secret
 */
export function generateTotpSecret(byteLength = 20) {
  const bytes = crypto.randomBytes(byteLength);
  return base32Encode(bytes);
}

/**
 * Generates a 6-digit TOTP code for a given secret at a specific counter step.
 * @param {string} base32Secret
 * @param {number} [counter] 8-byte step counter (defaults to current 30s epoch)
 * @returns {string} 6-digit string
 */
export function generateTotpCode(base32Secret, counter = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(base32Secret);

  // Counter to 8-byte big-endian buffer
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (codeInt % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP code against a secret within a time window.
 * @param {string} base32Secret
 * @param {string} code
 * @param {number} [window=1] Window of +/- steps to accept (1 step = 30s)
 * @returns {boolean}
 */
export function verifyTotpCode(base32Secret, code, window = 1) {
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  const codeBuffer = Buffer.from(code, 'utf8');

  for (let offset = -window; offset <= window; offset++) {
    const step = currentStep + offset;
    const generated = generateTotpCode(base32Secret, step);
    const genBuffer = Buffer.from(generated, 'utf8');

    if (codeBuffer.length === genBuffer.length && crypto.timingSafeEqual(codeBuffer, genBuffer)) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URL for authenticator apps (Google Authenticator, Authy, 1Password).
 * @param {string} email
 * @param {string} base32Secret
 * @param {string} [issuer='APIWatch']
 * @returns {string}
 */
export function generateTotpUri(email, base32Secret, issuer = 'APIWatch') {
  const cleanEmail = encodeURIComponent(email);
  const cleanIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${base32Secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}
