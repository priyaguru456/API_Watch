const SENSITIVE_KEY_PATTERNS = [
  /passw(or)?d/i,
  /secret/i,
  /token/i,
  /encryptedauth/i,
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /client[_-]?secret/i,
  /private[_-]?key/i,
  /credential/i,
  /dek/i,
  /master[_-]?key/i,
];

const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_\-.]+/gi;
const BASIC_AUTH_REGEX = /Basic\s+[A-Za-z0-9+/=]+/gi;
const JWT_REGEX = /ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/g;
const HEX_64_KEY_REGEX = /\b[0-9a-fA-F]{64}\b/g;
const VAULT_CIPHER_REGEX = /vault:v\d+:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+/g;
const KEY_VALUE_SECRET_REGEX = /(token|secret|password|key)\s*[:=]\s*([^\s,;]+)/gi;

/**
 * Checks whether an object property name represents sensitive data.
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitizes a string by replacing embedded credentials, tokens, and raw keys.
 * @param {string} str
 * @returns {string}
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;

  return str
    .replace(BEARER_REGEX, 'Bearer [REDACTED]')
    .replace(BASIC_AUTH_REGEX, 'Basic [REDACTED]')
    .replace(JWT_REGEX, '[REDACTED_JWT]')
    .replace(HEX_64_KEY_REGEX, '[REDACTED_KEY]')
    .replace(VAULT_CIPHER_REGEX, 'vault:v[REDACTED]')
    .replace(KEY_VALUE_SECRET_REGEX, '$1: [REDACTED]');
}

/**
 * Recursively redacts sensitive keys and values from objects, arrays, and strings.
 * Safely handles circular references and arbitrary depth.
 *
 * @param {any} value
 * @param {WeakSet<object>} [seen]
 * @returns {any}
 */
export function redactSensitiveData(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  // Handle circular references
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  // Handle Error objects
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      code: value.code,
      statusCode: value.statusCode,
    };
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, seen));
  }

  // Handle Buffers / Dates
  if (Buffer.isBuffer(value)) {
    return '[BUFFER]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  // Handle Objects
  const redactedObj = {};
  for (const [key, val] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      if (typeof val === 'object' && val !== null && !Buffer.isBuffer(val)) {
        // Nested container (e.g. credentials: { ... } or auth: { ... }) -> recurse inside
        redactedObj[key] = redactSensitiveData(val, seen);
      } else if (
        key.toLowerCase() === 'authorization' &&
        typeof val === 'string' &&
        val.startsWith('Bearer ')
      ) {
        redactedObj[key] = 'Bearer [REDACTED]';
      } else {
        redactedObj[key] = '[REDACTED]';
      }
    } else {
      redactedObj[key] = redactSensitiveData(val, seen);
    }
  }

  return redactedObj;
}

/**
 * Pino log redaction serializer configuration and custom formatters.
 * Ensures secrets never appear in logs regardless of how or where they are logged.
 */
export const pinoRedactionSerializer = {
  /**
   * Serializes and redacts Express/Node request objects.
   * @param {object} req
   */
  req(req) {
    if (!req) return req;
    const sanitizedHeaders = { ...req.headers };
    if (sanitizedHeaders.authorization) sanitizedHeaders.authorization = 'Bearer [REDACTED]';
    if (sanitizedHeaders.cookie) sanitizedHeaders.cookie = '[REDACTED]';
    if (sanitizedHeaders['x-api-key']) sanitizedHeaders['x-api-key'] = '[REDACTED]';
    if (sanitizedHeaders['x-csrf-token']) sanitizedHeaders['x-csrf-token'] = '[REDACTED]';

    return {
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      headers: redactSensitiveData(sanitizedHeaders),
      remoteAddress: req.remoteAddress || req.ip,
      body: req.body ? redactSensitiveData(req.body) : undefined,
      query: req.query ? redactSensitiveData(req.query) : undefined,
      params: req.params ? redactSensitiveData(req.params) : undefined,
    };
  },

  /**
   * Serializes and redacts response objects.
   * @param {object} res
   */
  res(res) {
    if (!res) return res;
    return {
      statusCode: res.statusCode,
      headers: res.getHeaders ? redactSensitiveData(res.getHeaders()) : undefined,
    };
  },

  /**
   * Serializes and redacts error objects.
   * @param {Error|object} err
   */
  err(err) {
    if (!err) return err;
    return {
      type: err.name || 'Error',
      message: sanitizeString(err.message || 'Unknown error'),
      code: err.code,
      statusCode: err.statusCode,
    };
  },

  /**
   * Generic object serializer.
   * @param {any} data
   */
  data(data) {
    return redactSensitiveData(data);
  },
};
