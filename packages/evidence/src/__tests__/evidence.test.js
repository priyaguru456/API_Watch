import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  verifyEvidenceChain,
  generateIncidentSnapshotProof,
} from '../index.js';

describe('Tamper-Evident Evidence Package (@apiwatch/evidence)', () => {
  it('creates cryptographic evidence record with SHA-256 hash', () => {
    const record = createEvidenceRecord({
      payload: { action: 'USER_LOGIN', userId: 'user-1' },
    });

    expect(record.evidenceHash).toBeTypeOf('string');
    expect(record.evidenceHash).toHaveLength(64);
    expect(record.previousHash).toBe('0'.repeat(64));
  });

  it('verifies a valid linear chain of evidence entries', () => {
    const r1 = createEvidenceRecord({ payload: { step: 1 } });
    const r2 = createEvidenceRecord({ previousHash: r1.evidenceHash, payload: { step: 2 } });
    const r3 = createEvidenceRecord({ previousHash: r2.evidenceHash, payload: { step: 3 } });

    expect(verifyEvidenceChain([r1, r2, r3])).toBe(true);
  });

  it('detects tampering when an evidence record payload is altered', () => {
    const r1 = createEvidenceRecord({ payload: { action: 'AUTH', user: 'alice' } });
    const r2 = createEvidenceRecord({
      previousHash: r1.evidenceHash,
      payload: { action: 'WRITE', target: 'monitor-1' },
    });

    // Tamper with r1
    const tampered = [{ ...r1, payload: { action: 'AUTH', user: 'eve' } }, r2];

    expect(() => verifyEvidenceChain(tampered)).toThrow(/Evidence record tampered/);
  });

  it('generates immutable incident snapshot proofs', () => {
    const incident = {
      id: 'inc-123',
      organizationId: 'org-456',
      status: 'RESOLVED',
      severity: 'CRITICAL',
      startedAt: new Date(),
      resolvedAt: new Date(),
    };

    const proof = generateIncidentSnapshotProof(incident, [
      { id: 'chk-1', statusCode: 500, checkedAt: new Date() },
    ]);

    expect(proof.evidenceHash).toHaveLength(64);
    expect(proof.payload.incidentId).toBe('inc-123');
  });
});
