import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptClaimPayload,
  encryptClaimPayload,
  generateClaimKey,
  generateMerkleProof,
  generateMerkleTree,
  verifyMerkleProof,
} from './crypto.js';
import type { ClaimPayload } from '../types/index.js';

test('generates high-entropy, URL-safe claim keys', () => {
  const keys = new Set(Array.from({ length: 100 }, () => generateClaimKey()));
  assert.equal(keys.size, 100);
  for (const key of keys) {
    assert.match(key, /^VP-[A-Za-z0-9_-]{32}$/);
  }
});

test('encrypts and authenticates claim payloads', () => {
  const payload: ClaimPayload = {
    claimKey: generateClaimKey(),
    employeeId: 'employee-1',
    employeeName: 'Ada Lovelace',
    walletAddress: `0x${'a'.repeat(40)}`,
    batchId: 'batch-1',
    amount: 1250.5,
    generatedAt: new Date(0).toISOString(),
  };

  assert.deepEqual(decryptClaimPayload(encryptClaimPayload(payload)), payload);
});

test('builds and verifies Merkle inclusion proofs', () => {
  const tree = generateMerkleTree(['a', 'b', 'c']);
  const proof = generateMerkleProof(tree, 1);
  assert.equal(verifyMerkleProof(proof), true);
  assert.equal(verifyMerkleProof({ ...proof, leaf: 'tampered' }), false);
});
