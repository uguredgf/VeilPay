import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import app from '../server.js';
import db, { initDatabase } from '../database/init.js';
import midnightService from '../services/midnight.js';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function readApi<T>(response: Response): Promise<ApiEnvelope<T>> {
  return response.json() as Promise<ApiEnvelope<T>>;
}

function workspaceHeaders(token: string, json = false): Record<string, string> {
  return {
    'X-VeilPay-Workspace': token,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

test('isolates private workspaces and completes the simulated claim flow', async () => {
  initDatabase();
  await midnightService.connectToNetwork({
    network: 'testnet',
    indexerUrl: 'simulation://indexer',
    nodeUrl: 'simulation://node',
    proofServerUrl: 'simulation://proof-server',
  });

  const workspaceA = randomBytes(32).toString('base64url');
  const workspaceB = randomBytes(32).toString('base64url');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const health = await readApi<{ mode: string; connected: boolean }>(healthResponse);
    assert.equal(healthResponse.status, 200);
    assert.equal(health.data?.mode, 'simulation');
    assert.equal(health.data?.connected, false);

    const anonymousHistoryResponse = await fetch(`${baseUrl}/employer/payroll/history`);
    const anonymousHistory = await readApi<never>(anonymousHistoryResponse);
    assert.equal(anonymousHistoryResponse.status, 401);
    assert.equal(anonymousHistory.success, false);

    const csv = [
      'name,wallet_address,amount,department',
      `Ada Lovelace,0x${'a'.repeat(40)},8200.50,Engineering`,
    ].join('\n');
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'payroll.csv');

    const uploadResponse = await fetch(`${baseUrl}/employer/payroll/upload`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA),
      body: form,
    });
    const upload = await readApi<{ batch: { id: string } }>(uploadResponse);
    assert.equal(uploadResponse.status, 200);
    assert.ok(upload.data?.batch.id);
    const batchId = upload.data.batch.id;

    const storedEmployee = db.prepare(`
      SELECT e.name, e.wallet_address
      FROM employees e
      JOIN payroll_items pi ON pi.employee_id = e.id
      WHERE pi.batch_id = ?
    `).get(batchId) as { name: string; wallet_address: string };
    assert.equal(storedEmployee.name, 'Encrypted employee');
    assert.match(storedEmployee.wallet_address, /^private:[a-f0-9]{64}$/);

    const otherHistoryResponse = await fetch(`${baseUrl}/employer/payroll/history`, {
      headers: workspaceHeaders(workspaceB),
    });
    const otherHistory = await readApi<{ batches: unknown[] }>(otherHistoryResponse);
    assert.equal(otherHistoryResponse.status, 200);
    assert.deepEqual(otherHistory.data?.batches, []);

    const otherBatchResponse = await fetch(`${baseUrl}/employer/payroll/batch/${batchId}`, {
      headers: workspaceHeaders(workspaceB),
    });
    assert.equal(otherBatchResponse.status, 404);

    const otherExecutionResponse = await fetch(`${baseUrl}/employer/payroll/execute`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceB, true),
      body: JSON.stringify({ batchId }),
    });
    assert.equal(otherExecutionResponse.status, 422);

    const executeResponse = await fetch(`${baseUrl}/employer/payroll/execute`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, true),
      body: JSON.stringify({ batchId }),
    });
    const execution = await readApi<{
      batch: { tx_hash: string };
      claims: Array<{ claimKey: string; employeeName: string }>;
    }>(executeResponse);
    assert.equal(executeResponse.status, 200);
    assert.match(execution.data?.batch.tx_hash ?? '', /^sim_/);
    assert.equal(execution.data?.claims.length, 1);
    assert.equal(execution.data?.claims[0]?.employeeName, 'Ada Lovelace');

    const otherComplianceResponse = await fetch(`${baseUrl}/compliance/check`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceB, true),
      body: JSON.stringify({ batchId }),
    });
    assert.equal(otherComplianceResponse.status, 422);

    const complianceResponse = await fetch(`${baseUrl}/compliance/check`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, true),
      body: JSON.stringify({ batchId }),
    });
    const compliance = await readApi<{ proof_hash: string }>(complianceResponse);
    assert.equal(complianceResponse.status, 200);
    assert.match(compliance.data?.proof_hash ?? '', /^sim_proof_/);

    const listAddress = `0x${'c'.repeat(40)}`;
    const addListResponse = await fetch(`${baseUrl}/compliance/allowlist`, {
      method: 'POST',
      headers: workspaceHeaders(workspaceA, true),
      body: JSON.stringify({ address: listAddress, addedBy: 'Integration test' }),
    });
    assert.equal(addListResponse.status, 200);

    const otherListsResponse = await fetch(`${baseUrl}/compliance/lists`, {
      headers: workspaceHeaders(workspaceB),
    });
    const otherLists = await readApi<{ allowlist: unknown[]; blocklist: unknown[] }>(otherListsResponse);
    assert.deepEqual(otherLists.data, { allowlist: [], blocklist: [] });

    const otherAuditResponse = await fetch(`${baseUrl}/compliance/audit`, {
      headers: workspaceHeaders(workspaceB),
    });
    const otherAudit = await readApi<{ logs: unknown[] }>(otherAuditResponse);
    assert.deepEqual(otherAudit.data?.logs, []);

    const legacyAddressResponse = await fetch(`${baseUrl}/employee/${listAddress}/balance`);
    assert.equal(legacyAddressResponse.status, 404);

    const secretKey = execution.data?.claims[0]?.claimKey;
    assert.ok(secretKey);
    const verifyResponse = await fetch(`${baseUrl}/employee/claim/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretKey }),
    });
    const verification = await readApi<{ claimable: boolean; employeeName: string }>(verifyResponse);
    assert.equal(verifyResponse.status, 200);
    assert.equal(verification.data?.claimable, true);
    assert.equal(verification.data?.employeeName, 'Ada Lovelace');

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
