import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import app from '../server.js';
import { initDatabase } from '../database/init.js';
import midnightService from '../services/midnight.js';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: string;
}

async function readApi<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json() as Promise<ApiEnvelope<T>>;
}

test('completes the simulated payroll API flow and rejects a concurrent double withdrawal', async () => {
  initDatabase();
  await midnightService.connectToNetwork({
    network: 'testnet',
    indexerUrl: 'simulation://indexer',
    nodeUrl: 'simulation://node',
    proofServerUrl: 'simulation://proof-server',
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const health = await readApi<{ mode: string; connected: boolean }>(healthResponse);
    assert.equal(healthResponse.status, 200);
    assert.equal(health.data.mode, 'simulation');
    assert.equal(health.data.connected, false);

    const csv = [
      'name,wallet_address,amount,department',
      `Ada Lovelace,0x${'a'.repeat(40)},8200.50,Engineering`,
    ].join('\n');
    const form = new FormData();
    form.append('employerId', `integration-${Date.now()}`);
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'payroll.csv');

    const uploadResponse = await fetch(`${baseUrl}/employer/payroll/upload`, {
      method: 'POST',
      body: form,
    });
    const upload = await readApi<{ batch: { id: string } }>(uploadResponse);
    assert.equal(uploadResponse.status, 200);

    const executeResponse = await fetch(`${baseUrl}/employer/payroll/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: upload.data.batch.id }),
    });
    const execution = await readApi<{
      batch: { tx_hash: string };
      claims: Array<{ claimKey: string }>;
    }>(executeResponse);
    assert.equal(executeResponse.status, 200);
    assert.match(execution.data.batch.tx_hash, /^sim_/);
    assert.equal(execution.data.claims.length, 1);

    const complianceResponse = await fetch(`${baseUrl}/compliance/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: upload.data.batch.id }),
    });
    const compliance = await readApi<{ proof_hash: string }>(complianceResponse);
    assert.equal(complianceResponse.status, 200);
    assert.match(compliance.data.proof_hash, /^sim_proof_/);

    const secretKey = execution.data.claims[0]!.claimKey;
    const verifyResponse = await fetch(`${baseUrl}/employee/claim/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretKey }),
    });
    const verification = await readApi<{ claimable: boolean }>(verifyResponse);
    assert.equal(verification.data.claimable, true);

    const withdrawal = () => fetch(`${baseUrl}/employee/claim/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretKey,
        walletAddress: `0x${'b'.repeat(40)}`,
      }),
    });
    const responses = await Promise.all([withdrawal(), withdrawal()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
