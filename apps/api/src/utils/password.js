import crypto from 'node:crypto';

/**
 * Password hashing and verification using Argon2id.
 * Falls back to crypto.scrypt if native argon2 bindings are not present in the runtime.
 */
let argon2Module = null;

try {
  argon2Module = await import('@node-rs/argon2');
} catch {
  try {
    argon2Module = await import('argon2');
  } catch {
    // Native argon2 not available, will use fallback
  }
}

/**
 * Hashes a plaintext password using Argon2id (or secure scrypt fallback).
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (argon2Module) {
    if (argon2Module.hash) {
      return argon2Module.hash(password, {
        memoryCost: 19456,
        timeCost: 2,
        outputLen: 32,
        parallelism: 1,
      });
    }
  }

  // Pure Node.js fallback using crypto.scrypt with standard params
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`$scrypt$N=16384,r=8,p=1$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plaintext password against a stored hash.
 * @param {string} hash
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  if (argon2Module && !hash.startsWith('$scrypt$')) {
    if (argon2Module.verify) {
      return argon2Module.verify(hash, password);
    }
  }

  if (hash.startsWith('$scrypt$')) {
    return new Promise((resolve) => {
      const parts = hash.split('$');
      if (parts.length < 5) return resolve(false);
      const salt = parts[3];
      const originalKey = parts[4];

      crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return resolve(false);
        resolve(crypto.timingSafeEqual(Buffer.from(originalKey, 'hex'), derivedKey));
      });
    });
  }

  return false;
}
