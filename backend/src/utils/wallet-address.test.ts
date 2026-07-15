import assert from 'node:assert/strict';
import test from 'node:test';
import { isSupportedWalletAddress, normalizeWalletAddress } from './wallet-address.js';

test('accepts Midnight Bech32m-shaped Lace addresses', () => {
  const address = `mn_shield-addr_test1${'q'.repeat(120)}p`;
  assert.equal(isSupportedWalletAddress(address), true);
});

test('keeps legacy hex addresses only for the local demo flow', () => {
  assert.equal(isSupportedWalletAddress(`0x${'A'.repeat(40)}`), true);
  assert.equal(normalizeWalletAddress(`  0x${'A'.repeat(40)}  `), `0x${'a'.repeat(40)}`);
});

test('rejects arbitrary recipient strings', () => {
  assert.equal(isSupportedWalletAddress('not-a-wallet'), false);
});
