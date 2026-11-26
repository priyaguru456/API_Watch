import crypto from 'node:crypto';

/**
 * Creates a tamper-evident hash chain for audit and check evidence.
 * Each entry includes SHA-256(prevHash + timestamp + payload).
 */
export function createEvidenceRecord({
  previousHash = '0'.repeat(64),
  payload,
  timestamp = new Date(),
}) {
  const ts =
    timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
  const canonicalPayload =
    typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, Object.keys(payload || {}).sort());

  const hash = crypto
    .createHash('sha256')
    .update(`${previousHash}:${ts}:${canonicalPayload}`)
    .digest('hex');

  return {
    previousHash,
    timestamp: ts,
    payload,
    evidenceHash: hash,
  };
}

/**
 * Verifies a sequential chain of evidence records.
 * Returns true if the entire chain is valid, or throws an error with the broken record index.
 */
export function verifyEvidenceChain(chain) {
  if (!Array.isArray(chain) || chain.length === 0) {
    return true;
  }

  for (let i = 0; i < chain.length; i++) {
    const record = chain[i];
    const expectedPrev = i === 0 ? record.previousHash : chain[i - 1].evidenceHash;

    if (record.previousHash !== expectedPrev) {
      throw new Error(`Evidence chain broken at index ${i}: previousHash mismatch`);
    }

    const calculated = createEvidenceRecord({
      previousHash: record.previousHash,
      payload: record.payload,
      timestamp: record.timestamp,
    });

    if (calculated.evidenceHash !== record.evidenceHash) {
      throw new Error(`Evidence record tampered at index ${i}: hash mismatch`);
    }
  }

  return true;
}

/**
 * Generates an immutable snapshot proof for incident/SLA audits.
 */
export function generateIncidentSnapshotProof(incident, checkResults = []) {
  const payload = {
    incidentId: incident.id,
    organizationId: incident.organizationId,
    status: incident.status,
    severity: incident.severity,
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    checksCount: checkResults.length,
    checksHash: crypto
      .createHash('sha256')
      .update(
        JSON.stringify(
          checkResults.map((c) => ({ id: c.id, status: c.statusCode, time: c.checkedAt }))
        )
      )
      .digest('hex'),
  };

  return createEvidenceRecord({ payload });
}
