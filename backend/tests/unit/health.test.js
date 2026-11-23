/**
 * Health Endpoint Unit Test
 * Tests GET /api/v1/health using Node.js native test runner
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import app from '../../src/app.js';

test('Health check endpoint returns 200 and valid JSON schema', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    assert.strictEqual(response.status, 200, 'Expected HTTP 200 OK');

    const body = await response.json();
    assert.strictEqual(body.success, true, 'Expected success to be true');
    assert.strictEqual(body.message, 'APIWatch API is running', 'Expected message to match');
    assert.ok(body.timestamp, 'Expected timestamp to be present');
    assert.strictEqual(body.data.status, 'healthy', 'Expected status to be healthy');
  } finally {
    server.close();
  }
});
