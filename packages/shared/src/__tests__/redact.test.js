import { describe, it, expect } from 'vitest';
import {
  redactSensitiveData,
  sanitizeString,
  isSensitiveKey,
  pinoRedactionSerializer,
} from '../redact.js';

describe('packages/shared: redactSensitiveData & Log Serializer', () => {
  describe('isSensitiveKey', () => {
    it('identifies sensitive key names case-insensitively', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
      expect(isSensitiveKey('TOKEN')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('refresh_token')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('api-key')).toBe(true);
      expect(isSensitiveKey('client_secret')).toBe(true);
      expect(isSensitiveKey('encryptedAuth')).toBe(true);
      expect(isSensitiveKey('masterKey')).toBe(true);
      expect(isSensitiveKey('dek')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);

      expect(isSensitiveKey('username')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('redacts Bearer tokens in strings', () => {
      const input = 'Request failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.123';
      const output = sanitizeString(input);
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.123');
      expect(output).toContain('Bearer [REDACTED]');
    });

    it('redacts 64-character raw hex keys', () => {
      const input = 'Key used: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const output = sanitizeString(input);
      expect(output).not.toContain(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      );
      expect(output).toContain('[REDACTED_KEY]');
    });

    it('redacts vault ciphertext strings', () => {
      const input = 'Stored value: vault:v1:a1b2c3d4e5f6:0123456789abcdef:abcdef0123456789';
      const output = sanitizeString(input);
      expect(output).not.toContain('a1b2c3d4e5f6');
      expect(output).toContain('vault:v[REDACTED]');
    });
  });

  describe('redactSensitiveData (Deep Recursive Redaction)', () => {
    it('replaces sensitive keys at arbitrary depths', () => {
      const raw = {
        user: {
          id: 'u-1',
          name: 'Alice',
          password: 'super-secret-password-123',
          credentials: {
            apiKey: 'live_sec_998877665544332211',
            client_secret: 'shhh-secret',
          },
        },
        payload: {
          token: 'token-abc-xyz',
          encryptedAuth: 'vault:v1:0123:4567:89ab',
        },
        publicField: 'safe data',
      };

      const redacted = redactSensitiveData(raw);

      expect(redacted.user.name).toBe('Alice');
      expect(redacted.publicField).toBe('safe data');
      expect(redacted.user.password).toBe('[REDACTED]');
      expect(redacted.user.credentials.apiKey).toBe('[REDACTED]');
      expect(redacted.user.credentials.client_secret).toBe('[REDACTED]');
      expect(redacted.payload.token).toBe('[REDACTED]');
      expect(redacted.payload.encryptedAuth).toBe('[REDACTED]');
    });

    it('handles arrays of objects containing sensitive keys', () => {
      const list = [
        { id: 1, secret: 'sec-1' },
        { id: 2, secret: 'sec-2' },
      ];

      const redacted = redactSensitiveData(list);
      expect(redacted[0].secret).toBe('[REDACTED]');
      expect(redacted[1].secret).toBe('[REDACTED]');
      expect(redacted[0].id).toBe(1);
    });

    it('safely handles circular references without infinite loops', () => {
      const circular = { name: 'cycle' };
      circular.self = circular;

      const redacted = redactSensitiveData(circular);
      expect(redacted.name).toBe('cycle');
      expect(redacted.self).toBe('[CIRCULAR]');
    });

    it('sanitizes Error objects', () => {
      const err = new Error('Connection failed with token: secret-token-val');
      const redacted = redactSensitiveData(err);
      expect(redacted.name).toBe('Error');
      expect(redacted.message).toBe('Connection failed with token: [REDACTED]');
    });
  });

  describe('pinoRedactionSerializer', () => {
    it('serializes request and redacts sensitive headers and body', () => {
      const req = {
        id: 'req-123',
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: {
          authorization: 'Bearer secret-jwt-here',
          cookie: 'refresh_token=secret-cookie',
          'x-api-key': 'live_key_123',
          'content-type': 'application/json',
        },
        body: {
          email: 'test@example.com',
          password: 'SecretPassword99!',
        },
      };

      const serialized = pinoRedactionSerializer.req(req);
      expect(serialized.headers.authorization).toBe('Bearer [REDACTED]');
      expect(serialized.headers.cookie).toBe('[REDACTED]');
      expect(serialized.headers['x-api-key']).toBe('[REDACTED]');
      expect(serialized.headers['content-type']).toBe('application/json');
      expect(serialized.body.password).toBe('[REDACTED]');
      expect(serialized.body.email).toBe('test@example.com');
    });
  });
});
