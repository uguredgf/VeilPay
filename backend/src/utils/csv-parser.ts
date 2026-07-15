/**
 * VeilPay — CSV payroll file parser & validator.
 *
 * Expected CSV columns:
 *   name, wallet_address, amount, department (optional)
 *
 * The parser is streaming-safe and returns structured validation errors
 * that the frontend can display per-row.
 */

import { parse } from 'csv-parse/sync';
import type { CSVPayrollRow, CSVParseResult, CSVValidationError } from '../types/index.js';
import { isSupportedWalletAddress, normalizeWalletAddress } from './wallet-address.js';

/**
 * Simple regex for a hex address.
 * Midnight addresses are typically 64-char hex strings; we accept 40-66 chars
 * so the system also works with Ethereum-style addresses during demos.
 */
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const REQUIRED_COLUMNS = ['name', 'wallet_address', 'amount'];
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse a raw CSV buffer (or string) into structured payroll rows.
 * Returns items + any per-row validation errors.
 */
export function parsePayrollCSV(input: Buffer | string): CSVParseResult {
  const raw: string = Buffer.isBuffer(input) ? input.toString('utf-8') : input;

  let records: Record<string, string>[];
  try {
    records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      items: [],
      errors: [{ row: 0, field: 'file', message: `CSV parse error: ${(err as Error).message}` }],
      valid: false,
    };
  }

  if (records.length === 0) {
    return {
      items: [],
      errors: [{ row: 0, field: 'file', message: 'CSV file is empty or has no data rows.' }],
      valid: false,
    };
  }

  const columns = Object.keys(records[0] ?? {}).map((column) => column.trim());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missingColumns.length > 0) {
    return {
      items: [],
      errors: [{
        row: 1,
        field: 'header',
        message: `Missing required CSV column(s): ${missingColumns.join(', ')}.`,
      }],
      valid: false,
    };
  }

  const maxRows = Number.parseInt(process.env.MAX_PAYROLL_ROWS ?? '1000', 10);
  if (!Number.isSafeInteger(maxRows) || maxRows <= 0) {
    throw new Error('MAX_PAYROLL_ROWS must be a positive integer.');
  }
  if (records.length > maxRows) {
    return {
      items: [],
      errors: [{
        row: 0,
        field: 'file',
        message: `CSV contains ${records.length} rows; the configured limit is ${maxRows}.`,
      }],
      valid: false,
    };
  }

  const items: CSVPayrollRow[] = [];
  const errors: CSVValidationError[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2; // +2 because row 1 is the header

    const name = row['name']?.trim() ?? '';
    const walletAddress = normalizeWalletAddress(row['wallet_address'] ?? '');
    const amountStr = row['amount']?.trim() ?? '';
    const department = row['department']?.trim() || undefined;

    // ── Per-field validation ────────────────────────────────────────────
    if (!name) {
      errors.push({ row: rowNum, field: 'name', message: 'Name is required.' });
    } else if (name.length > 120 || CONTROL_CHAR_RE.test(name)) {
      errors.push({
        row: rowNum,
        field: 'name',
        message: 'Name must be at most 120 characters and contain no control characters.',
      });
    }

    if (department && (department.length > 120 || CONTROL_CHAR_RE.test(department))) {
      errors.push({
        row: rowNum,
        field: 'department',
        message: 'Department must be at most 120 characters and contain no control characters.',
      });
    }

    if (!walletAddress) {
      errors.push({ row: rowNum, field: 'wallet_address', message: 'Wallet address is required.' });
    } else if (!isSupportedWalletAddress(walletAddress)) {
      errors.push({
        row: rowNum,
        field: 'wallet_address',
        message: `Invalid wallet address: "${walletAddress}".`,
      });
    }

    const amount = Number(amountStr);
    if (!amountStr || !MONEY_RE.test(amountStr) || !Number.isFinite(amount)) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: 'Amount must be a positive decimal with at most two fractional digits.',
      });
    } else if (amount <= 0) {
      errors.push({ row: rowNum, field: 'amount', message: 'Amount must be greater than zero.' });
    }

    // Only push valid rows
    if (
      name && name.length <= 120 && !CONTROL_CHAR_RE.test(name) &&
      walletAddress &&
      isSupportedWalletAddress(walletAddress) &&
      MONEY_RE.test(amountStr) &&
      Number.isFinite(amount) &&
      amount > 0 &&
      (!department || (department.length <= 120 && !CONTROL_CHAR_RE.test(department)))
    ) {
      items.push({ name, wallet_address: walletAddress, amount, department });
    }
  }

  return {
    items,
    errors,
    valid: errors.length === 0,
  };
}

/**
 * Run additional business-rule validation on already-parsed rows.
 * - Duplicate wallet addresses
 * - Unreasonably large amounts
 */
export function validatePayrollData(items: CSVPayrollRow[]): CSVValidationError[] {
  const errors: CSVValidationError[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const rowNum = i + 2;

    // Duplicate address check
    const normAddr = item.wallet_address.toLowerCase();
    if (seen.has(normAddr)) {
      errors.push({
        row: rowNum,
        field: 'wallet_address',
        message: `Duplicate wallet address (first seen on row ${seen.get(normAddr)}).`,
      });
    } else {
      seen.set(normAddr, rowNum);
    }

    // Sanity-check amount ceiling (configurable via env in production)
    const ceiling = Number(process.env.MAX_PAYMENT_AMOUNT ?? '1000000');
    if (!Number.isFinite(ceiling) || ceiling <= 0) {
      throw new Error('MAX_PAYMENT_AMOUNT must be a positive number.');
    }
    if (item.amount > ceiling) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: `Amount ${item.amount} exceeds maximum allowed (${ceiling}).`,
      });
    }
  }

  return errors;
}
