/**
 * VeilPay — Cryptographic helper utilities.
 *
 * Provides commitment generation, nullifier derivation, and Merkle-tree
 * construction / verification using Node's built-in `crypto` module.
 *
 * In production these would be replaced by Midnight's Poseidon hash and
 * the Compact VM's native ZK primitives — these implementations serve as
 * functionally-equivalent stand-ins for development and testing.
 */

import crypto from 'node:crypto';
import type { ClaimPayload, MerkleTree, MerkleProof } from '../types/index.js';

// ────────────────────────────────────────────────────────────────────────────
// Hash primitives
// ────────────────────────────────────────────────────────────────────────────

/** SHA-256 hex digest – acts as our Poseidon stand-in. */
function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Hash two children together (sorted for deterministic ordering). */
function hashPair(left: string, right: string): string {
  return hash(left + right);
}

// ────────────────────────────────────────────────────────────────────────────
// Commitment & Nullifier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate a Pedersen-style commitment: H(secret || amount).
 *
 * In production this would be a Poseidon hash inside a Compact circuit.
 * The commitment hides both the recipient and the amount on-chain.
 */
export function generateCommitment(secret: string, amount: number): string {
  return hash(`${secret}:${amount.toFixed(8)}`);
}

/**
 * Derive a nullifier from a commitment and the owner's secret.
 *
 * The nullifier is revealed at claim time to prevent double-spending
 * without disclosing which commitment is being consumed.
 */
export function generateNullifier(commitment: string, secret: string): string {
  return hash(`nullifier:${commitment}:${secret}`);
}

/**
 * Generate a random secret that can be used as the blinding factor
 * for commitments and nullifiers.
 */
export function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateClaimKey(): string {
  return `VP-${crypto.randomBytes(24).toString('base64url')}`;
}

export function hashClaimKey(claimKey: string): string {
  return hash(`claim:${claimKey.trim()}`);
}

function getClaimCipherKey(): Buffer {
  const secret = process.env.CLAIM_ENCRYPTION_SECRET ?? 'veilpay-dev-claim-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

export function assertCryptoConfiguration(): void {
  const secret = process.env.CLAIM_ENCRYPTION_SECRET?.trim();
  if (
    process.env.NODE_ENV === 'production' &&
    (!secret || secret === 'veilpay-dev-claim-secret' || secret.startsWith('replace-with-'))
  ) {
    throw new Error('CLAIM_ENCRYPTION_SECRET must be set to a strong, unique value in production.');
  }
}

export function encryptClaimPayload(payload: ClaimPayload): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getClaimCipherKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptClaimPayload(encodedPayload: string): ClaimPayload {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = encodedPayload.split('.');
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error('Invalid encrypted claim payload format.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getClaimCipherKey(),
    Buffer.from(ivEncoded, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8')) as ClaimPayload;
}

// ────────────────────────────────────────────────────────────────────────────
// Merkle Tree
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a binary Merkle tree from an array of leaf hashes.
 *
 * Leaves are padded to the next power of two with the zero hash so the
 * tree is always complete.
 */
export function generateMerkleTree(commitments: string[]): MerkleTree {
  if (commitments.length === 0) {
    return { root: hash('empty'), leaves: [], layers: [[hash('empty')]], depth: 0 };
  }

  // Pad to next power of two
  const ZERO_LEAF = hash('zero');
  const leaves = [...commitments];
  while (leaves.length & (leaves.length - 1)) {
    leaves.push(ZERO_LEAF);
  }
  // Edge case: single leaf
  if (leaves.length === 1) {
    leaves.push(ZERO_LEAF);
  }

  const layers: string[][] = [leaves];

  let currentLayer = leaves;
  while (currentLayer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < currentLayer.length; i += 2) {
      next.push(hashPair(currentLayer[i]!, currentLayer[i + 1]!));
    }
    layers.push(next);
    currentLayer = next;
  }

  return {
    root: currentLayer[0]!,
    leaves,
    layers,
    depth: layers.length - 1,
  };
}

/**
 * Generate a Merkle inclusion proof for the leaf at `index`.
 */
export function generateMerkleProof(tree: MerkleTree, index: number): MerkleProof {
  if (index < 0 || index >= tree.leaves.length) {
    throw new RangeError(`Leaf index ${index} out of range [0, ${tree.leaves.length})`);
  }

  const siblings: string[] = [];
  let idx = index;

  for (let level = 0; level < tree.depth; level++) {
    const layer = tree.layers[level]!;
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    siblings.push(layer[siblingIdx]!);
    idx = Math.floor(idx / 2);
  }

  return {
    leaf: tree.leaves[index]!,
    index,
    siblings,
    root: tree.root,
  };
}

/**
 * Verify a Merkle inclusion proof.
 */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let current = proof.leaf;
  let idx = proof.index;

  for (const sibling of proof.siblings) {
    current = idx % 2 === 0 ? hashPair(current, sibling) : hashPair(sibling, current);
    idx = Math.floor(idx / 2);
  }

  return current === proof.root;
}
