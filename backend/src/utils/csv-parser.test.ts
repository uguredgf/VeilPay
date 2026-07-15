import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePayrollCSV, validatePayrollData } from './csv-parser.js';

const ADDRESS_A = `0x${'a'.repeat(40)}`;
const ADDRESS_B = `0x${'b'.repeat(40)}`;

test('parses and normalizes a valid payroll CSV', () => {
  const result = parsePayrollCSV(
    `name,wallet_address,amount,department\nAda Lovelace,${ADDRESS_A.toUpperCase()},8200.50,Engineering`,
  );

  assert.equal(result.valid, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.wallet_address, ADDRESS_A);
  assert.equal(result.items[0]?.amount, 8200.5);
});

test('rejects malformed and over-precise monetary amounts', () => {
  for (const amount of ['100usd', '1.001', 'Infinity', '-50']) {
    const result = parsePayrollCSV(
      `name,wallet_address,amount\nAda Lovelace,${ADDRESS_A},${amount}`,
    );
    assert.equal(result.valid, false, `Expected ${amount} to be rejected`);
  }
});

test('reports missing required headers', () => {
  const result = parsePayrollCSV(`name,address\nAda Lovelace,${ADDRESS_A}`);
  assert.equal(result.valid, false);
  assert.match(result.errors[0]?.message ?? '', /wallet_address, amount/);
});

test('detects duplicate wallet addresses case-insensitively', () => {
  const errors = validatePayrollData([
    { name: 'Ada', wallet_address: ADDRESS_B, amount: 10 },
    { name: 'Grace', wallet_address: ADDRESS_B.toUpperCase(), amount: 20 },
  ]);
  assert.equal(errors.some((error) => error.message.includes('Duplicate')), true);
});
