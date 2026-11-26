import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, maskSecret } from '../crypto.js';

describe('AES-256-GCM Encryption (@apiwatch/shared/crypto)', () => {
  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const plaintext = 'super-sensitive-api-token-bearer-xyz';

  it('encrypts and decrypts text accurately with AES-256-GCM', () => {
    const encrypted = encrypt(plaintext, validKey);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted, validKey);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext due to random IV', () => {
    const enc1 = encrypt(plaintext, validKey);
    const enc2 = encrypt(plaintext, validKey);
    expect(enc1).not.toBe(enc2);

    expect(decrypt(enc1, validKey)).toBe(plaintext);
    expect(decrypt(enc2, validKey)).toBe(plaintext);
  });

  it('throws an error if ciphertext or authentication tag is tampered with', () => {
    const encrypted = encrypt(plaintext, validKey);
    const [iv, authTag, data] = encrypted.split(':');
    const tamperedData = data.slice(0, -2) + (data.slice(-2) === 'aa' ? 'bb' : 'aa');
    const tamperedPayload = `${iv}:${authTag}:${tamperedData}`;

    expect(() => decrypt(tamperedPayload, validKey)).toThrow();
  });

  it('masks sensitive strings appropriately', () => {
    expect(maskSecret('my-secret-key-12345')).toBe('my-...345');
    expect(maskSecret('short')).toBe('******');
    expect(maskSecret(null)).toBe('***');
  });
});
