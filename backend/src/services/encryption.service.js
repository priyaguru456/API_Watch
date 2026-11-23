/**
 * Encryption Service
 * Handles password hashing and sensitive data encryption using bcrypt.
 */
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export const encryptionService = {
  /**
   * Hashes a plain text password
   * @param {string} password
   */
  async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  /**
   * Compares a plain text password with a hash
   * @param {string} password
   * @param {string} hash
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  },
};
