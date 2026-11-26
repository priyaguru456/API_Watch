import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  VaultService,
  EnvMasterKeyProvider,
  MemoryKeyStore,
  runRotationCli,
  parseArgs,
} from '../index.js';

describe('packages/vault: Envelope Encryption & Key Management', () => {
  const masterKeyV1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const masterKeyV2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
  const org1 = 'org-uuid-1111';
  const org2 = 'org-uuid-2222';

  let masterProvider;
  let keyStore;
  let vault;

  beforeEach(() => {
    masterProvider = new EnvMasterKeyProvider({
      keys: { v1: masterKeyV1, v2: masterKeyV2 },
      activeKeyId: 'v1',
    });
    keyStore = new MemoryKeyStore();
    vault = new VaultService({
      masterKeyProvider: masterProvider,
      keyStore,
    });
  });

  describe('MasterKeyProvider (KMS-Ready Interface)', () => {
    it('initializes with active key and retrieves master key buffer', async () => {
      expect(masterProvider.getActiveKeyId()).toBe('v1');
      const { keyId, key } = await masterProvider.getMasterKey('v1');
      expect(keyId).toBe('v1');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('rejects invalid hex keys or wrong lengths', () => {
      expect(() => masterProvider.registerKey('bad', 'tooshort')).toThrow(
        /must be a 64-character hex string/
      );
      expect(() =>
        masterProvider.registerKey(
          'bad',
          'not-hex-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
        )
      ).toThrow(/must be a 64-character hex string/);
    });

    it('wraps and unwraps DEK using AES-256-GCM', async () => {
      const rawDek = crypto.randomBytes(32);
      const { keyId, encryptedKey } = await masterProvider.encryptDataKey(rawDek, 'v1');

      expect(keyId).toBe('v1');
      expect(encryptedKey.split(':')).toHaveLength(3); // iv:tag:ciphertext

      const unwrappedDek = await masterProvider.decryptDataKey(encryptedKey, 'v1');
      expect(unwrappedDek.equals(rawDek)).toBe(true);
    });

    it('fails to unwrap if wrong master key ID is specified or ciphertext is tampered', async () => {
      const rawDek = crypto.randomBytes(32);
      const { encryptedKey } = await masterProvider.encryptDataKey(rawDek, 'v1');

      // Attempting to decrypt with v2 should fail tag verification
      await expect(masterProvider.decryptDataKey(encryptedKey, 'v2')).rejects.toThrow();

      // Tampering ciphertext
      const parts = encryptedKey.split(':');
      parts[2] = '00' + parts[2].slice(2);
      await expect(masterProvider.decryptDataKey(parts.join(':'), 'v1')).rejects.toThrow();
    });
  });

  describe('Envelope Encryption with Per-Org Data Keys', () => {
    it('creates a unique DEK for the organization on first encryption', async () => {
      const plaintext = 'super-secret-api-token-12345';
      const ciphertext = await vault.encrypt(org1, plaintext);

      expect(ciphertext.startsWith('vault:v1:')).toBe(true);
      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(5); // vault, v1, iv, tag, cipher

      const activeKey = await keyStore.getActiveKey(org1);
      expect(activeKey).toBeDefined();
      expect(activeKey.keyVersion).toBe(1);
      expect(activeKey.organizationId).toBe(org1);
      expect(activeKey.masterKeyId).toBe('v1');
    });

    it('encrypts and decrypts string, json, and token payloads successfully', async () => {
      const testSecret = 'Authorization: Bearer sk-antigravity-998877';
      const encrypted = await vault.encrypt(org1, testSecret);
      const decrypted = await vault.decrypt(org1, encrypted);

      expect(decrypted).toBe(testSecret);
      expect(encrypted).not.toContain('sk-antigravity-998877');
    });

    it('guarantees per-org key isolation (Org 2 cannot decrypt Org 1 data)', async () => {
      const secretOrg1 = 'secret-payload-for-tenant-alpha';
      const encryptedOrg1 = await vault.encrypt(org1, secretOrg1);

      // Initialize Org 2 with its own key
      await vault.encrypt(org2, 'dummy');

      // Org 2 attempting to decrypt Org 1's ciphertext must fail
      await expect(vault.decrypt(org2, encryptedOrg1)).rejects.toThrow();
    });
  });

  describe('Key Versioning and Rotation', () => {
    it('rotates org key to version 2, retires version 1, and can still decrypt version 1 secrets', async () => {
      const oldSecret = 'my-old-secret-v1';
      const cipherV1 = await vault.encrypt(org1, oldSecret);
      expect(cipherV1.startsWith('vault:v1:')).toBe(true);

      // Rotate org key
      const rotationResult = await vault.rotateOrgKey(org1);
      expect(rotationResult.previousVersion).toBe(1);
      expect(rotationResult.newVersion).toBe(2);

      // Active key should now be v2
      const activeKey = await keyStore.getActiveKey(org1);
      expect(activeKey.keyVersion).toBe(2);
      expect(activeKey.status).toBe('ACTIVE');

      // Old key should be RETIRED
      const retiredKey = await keyStore.getKey(org1, 1);
      expect(retiredKey.status).toBe('RETIRED');

      // New encryptions must use v2
      const newSecret = 'my-new-secret-v2';
      const cipherV2 = await vault.encrypt(org1, newSecret);
      expect(cipherV2.startsWith('vault:v2:')).toBe(true);

      // Decryption of BOTH v1 and v2 works seamlessly (backward compatibility)
      expect(await vault.decrypt(org1, cipherV1)).toBe(oldSecret);
      expect(await vault.decrypt(org1, cipherV2)).toBe(newSecret);
    });

    it('re-encrypts stored records when reencrypt option is enabled during rotation', async () => {
      const mockMonitors = new Map([
        [
          'mon-1',
          {
            id: 'mon-1',
            organizationId: org1,
            encryptedAuth: await vault.encrypt(org1, 'auth-token-1'),
          },
        ],
        [
          'mon-2',
          {
            id: 'mon-2',
            organizationId: org1,
            encryptedAuth: await vault.encrypt(org1, 'auth-token-2'),
          },
        ],
      ]);

      const mockDb = {
        monitor: {
          async findMany({ where }) {
            return Array.from(mockMonitors.values()).filter(
              (m) => m.organizationId === where.organizationId
            );
          },
          async update({ where, data }) {
            const m = mockMonitors.get(where.id);
            Object.assign(m, data);
            return m;
          },
        },
      };

      const result = await vault.rotateOrgKey(org1, { reencrypt: true, db: mockDb });
      expect(result.reencryptedCount).toBe(2);

      // Check that all monitor secrets are now encrypted with v2
      const mon1 = mockMonitors.get('mon-1');
      expect(mon1.encryptedAuth.startsWith('vault:v2:')).toBe(true);
      expect(await vault.decrypt(org1, mon1.encryptedAuth)).toBe('auth-token-1');
    });
  });

  describe('Vault Rotation CLI', () => {
    it('parses CLI arguments accurately', () => {
      expect(parseArgs(['--org', 'org-123', '--reencrypt'])).toEqual({
        org: 'org-123',
        all: false,
        reencrypt: true,
        help: false,
      });

      expect(parseArgs(['--all', '-r'])).toEqual({
        org: null,
        all: true,
        reencrypt: true,
        help: false,
      });

      expect(parseArgs(['-h'])).toEqual({
        org: null,
        all: false,
        reencrypt: false,
        help: true,
      });
    });

    it('executes CLI rotation for single org', async () => {
      const mockDb = {
        monitor: {
          async findMany() {
            return [];
          },
        },
      };

      const result = await runRotationCli(['--org', org1], {
        vault,
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.result.newVersion).toBe(1); // Created v1
    });
  });
});
