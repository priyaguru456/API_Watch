/**
 * Interface contract for Organization Key Storage.
 */
export class KeyStore {
  /**
   * Retrieves active key for the organization.
   * @param {string} _organizationId
   * @returns {Promise<object|null>}
   */
  async getActiveKey(_organizationId) {
    throw new Error('KeyStore.getActiveKey() must be implemented');
  }

  /**
   * Retrieves a specific version of the key for the organization.
   * @param {string} _organizationId
   * @param {number} _version
   * @returns {Promise<object|null>}
   */
  async getKey(_organizationId, _version) {
    throw new Error('KeyStore.getKey() must be implemented');
  }

  /**
   * Saves a new key record.
   * @param {object} _record
   * @returns {Promise<object>}
   */
  async saveKey(_record) {
    throw new Error('KeyStore.saveKey() must be implemented');
  }

  /**
   * Updates key status (e.g. from ACTIVE to RETIRED).
   * @param {string} _organizationId
   * @param {number} _version
   * @param {string} _status
   * @returns {Promise<void>}
   */
  async updateKeyStatus(_organizationId, _version, _status) {
    throw new Error('KeyStore.updateKeyStatus() must be implemented');
  }

  /**
   * Lists all keys for an organization.
   * @param {string} _organizationId
   * @returns {Promise<object[]>}
   */
  async listKeys(_organizationId) {
    throw new Error('KeyStore.listKeys() must be implemented');
  }
}

/**
 * MemoryKeyStore for unit testing or transient key storage.
 */
export class MemoryKeyStore extends KeyStore {
  constructor() {
    super();
    // key: `${organizationId}:${keyVersion}`
    this.keys = new Map();
  }

  async getActiveKey(organizationId) {
    const orgKeys = [];
    for (const record of this.keys.values()) {
      if (record.organizationId === organizationId && record.status === 'ACTIVE') {
        orgKeys.push(record);
      }
    }
    orgKeys.sort((a, b) => b.keyVersion - a.keyVersion);
    return orgKeys[0] || null;
  }

  async getKey(organizationId, version) {
    return this.keys.get(`${organizationId}:${version}`) || null;
  }

  async saveKey(record) {
    const key = `${record.organizationId}:${record.keyVersion}`;
    const copy = {
      id: record.id || `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      organizationId: record.organizationId,
      keyVersion: record.keyVersion,
      encryptedKey: record.encryptedKey,
      masterKeyId: record.masterKeyId,
      algorithm: record.algorithm || 'aes-256-gcm',
      status: record.status || 'ACTIVE',
      createdAt: record.createdAt || new Date(),
      rotatedAt: record.rotatedAt || null,
    };
    this.keys.set(key, copy);
    return copy;
  }

  async updateKeyStatus(organizationId, version, status) {
    const record = this.keys.get(`${organizationId}:${version}`);
    if (record) {
      record.status = status;
      if (status === 'RETIRED') {
        record.rotatedAt = new Date();
      }
    }
  }

  async listKeys(organizationId) {
    const results = [];
    for (const record of this.keys.values()) {
      if (record.organizationId === organizationId) {
        results.push(record);
      }
    }
    return results.sort((a, b) => b.keyVersion - a.keyVersion);
  }
}

/**
 * PrismaKeyStore: Database-backed key storage via Prisma.
 */
export class PrismaKeyStore extends KeyStore {
  /**
   * @param {import('@prisma/client').PrismaClient} db
   */
  constructor(db) {
    super();
    if (!db) {
      throw new Error('PrismaKeyStore requires a PrismaClient instance');
    }
    this.db = db;
  }

  async getActiveKey(organizationId) {
    return this.db.organizationKey.findFirst({
      where: {
        organizationId,
        status: 'ACTIVE',
      },
      orderBy: { keyVersion: 'desc' },
    });
  }

  async getKey(organizationId, version) {
    return this.db.organizationKey.findUnique({
      where: {
        organizationId_keyVersion: {
          organizationId,
          keyVersion: version,
        },
      },
    });
  }

  async saveKey(record) {
    return this.db.organizationKey.create({
      data: {
        id: record.id,
        organizationId: record.organizationId,
        keyVersion: record.keyVersion,
        encryptedKey: record.encryptedKey,
        masterKeyId: record.masterKeyId,
        algorithm: record.algorithm || 'aes-256-gcm',
        status: record.status || 'ACTIVE',
      },
    });
  }

  async updateKeyStatus(organizationId, version, status) {
    await this.db.organizationKey.update({
      where: {
        organizationId_keyVersion: {
          organizationId,
          keyVersion: version,
        },
      },
      data: {
        status,
        ...(status === 'RETIRED' ? { rotatedAt: new Date() } : {}),
      },
    });
  }

  async listKeys(organizationId) {
    return this.db.organizationKey.findMany({
      where: { organizationId },
      orderBy: { keyVersion: 'desc' },
    });
  }
}
