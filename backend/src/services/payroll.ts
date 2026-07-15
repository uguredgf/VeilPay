import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import db, { logAudit } from '../database/init.js';
import midnightService from './midnight.js';
import { parsePayrollCSV, validatePayrollData } from '../utils/csv-parser.js';
import {
  decryptClaimPayload,
  encryptClaimPayload,
  generateClaimKey,
  generateCommitment,
  generateMerkleTree,
  generateNullifier,
  generateSecret,
  hashClaimKey,
} from '../utils/crypto.js';
import type {
  BatchClaimDistribution,
  ClaimPayload,
  ClaimVerificationResult,
  CSVParseResult,
  DashboardStats,
  Employee,
  PayrollBatch,
  PayrollBatchStatus,
  PayrollItem,
} from '../types/index.js';

const stmts = {
  upsertEmployee: () =>
    db.prepare(`
      INSERT INTO employees (id, name, wallet_address, department)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(wallet_address) DO UPDATE SET
        name = excluded.name,
        department = excluded.department
    `),

  insertBatch: () =>
    db.prepare(`
      INSERT INTO payroll_batches (id, employer_id, total_amount, employee_count, status)
      VALUES (?, ?, ?, ?, 'pending')
    `),

  insertItem: () =>
    db.prepare(`
      INSERT INTO payroll_items (
        id,
        batch_id,
        employee_id,
        amount,
        commitment,
        nullifier,
        claim_key_hash,
        encrypted_data
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

  getBatch: () => db.prepare('SELECT * FROM payroll_batches WHERE id = ?'),

  updateBatchStatus: () =>
    db.prepare(`
      UPDATE payroll_batches
      SET status = ?, tx_hash = ?, commitment_root = ?
      WHERE id = ?
    `),

  claimBatchForExecution: () =>
    db.prepare(`
      UPDATE payroll_batches
      SET status = 'processing'
      WHERE id = ? AND status = 'pending'
    `),

  getBatchItems: () => db.prepare('SELECT * FROM payroll_items WHERE batch_id = ?'),

  getEmployerBatches: () =>
    db.prepare('SELECT * FROM payroll_batches WHERE employer_id = ? ORDER BY created_at DESC'),

  getEmployeeByWallet: () => db.prepare('SELECT * FROM employees WHERE wallet_address = ?'),

  getClaimByHash: () =>
    db.prepare(`
      SELECT
        pi.*,
        pb.employer_id AS employer_id,
        pb.status AS batch_status,
        pb.created_at AS batch_created_at
      FROM payroll_items pi
      JOIN payroll_batches pb ON pb.id = pi.batch_id
      WHERE pi.claim_key_hash = ?
      LIMIT 1
    `),

  markClaimed: () =>
    db.prepare(`
      UPDATE payroll_items
      SET status = 'claimed',
          claimed_at = datetime('now'),
          withdraw_tx_hash = ?,
          withdrawal_address = ?
      WHERE id = ? AND status = 'pending'
    `),

  acquireWithdrawalLock: () =>
    db.prepare('INSERT OR IGNORE INTO withdrawal_locks (item_id) VALUES (?)'),

  releaseWithdrawalLock: () =>
    db.prepare('DELETE FROM withdrawal_locks WHERE item_id = ?'),

  clearStaleWithdrawalLocks: () =>
    db.prepare("DELETE FROM withdrawal_locks WHERE locked_at < datetime('now', '-15 minutes')"),

  getDistinctEmployeeCount: () =>
    db.prepare(`
      SELECT COUNT(DISTINCT pi.employee_id) AS employee_count
      FROM payroll_items pi
      JOIN payroll_batches pb ON pb.id = pi.batch_id
      WHERE pb.employer_id = ?
    `),
};

interface ClaimLookupRow extends PayrollItem {
  employer_id: string;
  batch_status: PayrollBatchStatus;
  batch_created_at: string;
}

export interface ResolvedClaimRecord extends ClaimVerificationResult {
  nullifier: string;
  employerId: string;
}

function getPrivateEmployeeReference(workspaceId: string, walletAddress: string): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}\0${walletAddress.toLowerCase()}`, 'utf8')
    .digest('hex');
  return `private:${digest}`;
}

export function createPayrollBatch(
  employerId: string,
  csvData: Buffer | string,
): { batch: PayrollBatch; parsed: CSVParseResult } {
  const parsed = parsePayrollCSV(csvData);
  if (!parsed.valid) {
    throw new PayrollError('CSV validation failed', parsed.errors);
  }

  const additionalErrors = validatePayrollData(parsed.items);
  if (additionalErrors.length > 0) {
    parsed.errors.push(...additionalErrors);
    parsed.valid = false;
    throw new PayrollError('Payroll data validation failed', parsed.errors);
  }

  const batchId = uuid();
  const totalAmount = parsed.items.reduce((sum, row) => sum + row.amount, 0);

  const createBatchTransaction = db.transaction(() => {
    stmts.insertBatch().run(batchId, employerId, totalAmount, parsed.items.length);

    for (const row of parsed.items) {
      const employeeId = uuid();
      const privateReference = getPrivateEmployeeReference(employerId, row.wallet_address);
      stmts.upsertEmployee().run(employeeId, 'Encrypted employee', privateReference, null);

      const employee = stmts.getEmployeeByWallet().get(privateReference) as Employee;
      const secret = generateSecret();
      const commitment = generateCommitment(secret, row.amount);
      const nullifier = generateNullifier(commitment, secret);
      const claimKey = generateClaimKey();
      const claimPayload: ClaimPayload = {
        claimKey,
        employeeId: employee.id,
        employeeName: row.name,
        walletAddress: row.wallet_address,
        batchId,
        amount: row.amount,
        generatedAt: new Date().toISOString(),
      };

      stmts.insertItem().run(
        uuid(),
        batchId,
        employee.id,
        row.amount,
        commitment,
        nullifier,
        hashClaimKey(claimKey),
        encryptClaimPayload(claimPayload),
      );
    }

    logAudit(
      uuid(),
      'payroll.batch.created',
      employerId,
      `Batch ${batchId} created with ${parsed.items.length} employees and total ${totalAmount}`,
    );
  });

  createBatchTransaction();

  return {
    batch: stmts.getBatch().get(batchId) as PayrollBatch,
    parsed,
  };
}

export async function executePayrollBatch(
  batchId: string,
  employerId: string,
): Promise<PayrollBatch> {
  const batch = stmts.getBatch().get(batchId) as PayrollBatch | undefined;
  if (!batch || batch.employer_id !== employerId) {
    throw new PayrollError(`Batch ${batchId} not found`);
  }
  if (batch.status !== 'pending') {
    throw new PayrollError(`Batch ${batchId} is already ${batch.status}`);
  }

  const reservation = stmts.claimBatchForExecution().run(batchId);
  if (reservation.changes !== 1) {
    throw new PayrollError(`Batch ${batchId} is already being processed.`);
  }

  try {
    const items = stmts.getBatchItems().all(batchId) as PayrollItem[];
    const commitments = items.map((item) => item.commitment!).filter(Boolean);
    const tree = generateMerkleTree(commitments);

    const result = await midnightService.callCircuit(
      'veilpay_payroll',
      'deposit_batch',
      {
        commitments,
        amounts: items.map((item) => item.amount),
      },
      {
        merkleRoot: tree.root,
        totalAmount: batch.total_amount,
        employeeCount: batch.employee_count,
      },
    );

    stmts.updateBatchStatus().run('completed', result.txHash, tree.root, batchId);
    logAudit(
      uuid(),
      'payroll.batch.executed',
      batch.employer_id,
      `Batch ${batchId} executed with tx ${result.txHash}`,
    );

    return stmts.getBatch().get(batchId) as PayrollBatch;
  } catch (error) {
    stmts.updateBatchStatus().run('failed', null, null, batchId);
    logAudit(
      uuid(),
      'payroll.batch.failed',
      batch.employer_id,
      `Batch ${batchId} failed: ${(error as Error).message}`,
    );
    throw error;
  }
}

export function getPayrollHistory(employerId: string): PayrollBatch[] {
  return stmts.getEmployerBatches().all(employerId) as PayrollBatch[];
}

type PublicPayrollItem = Pick<
  PayrollItem,
  | 'id'
  | 'batch_id'
  | 'employee_id'
  | 'amount'
  | 'commitment'
  | 'status'
  | 'claimed_at'
  | 'withdraw_tx_hash'
  | 'withdrawal_address'
>;

export function getBatchDetails(
  batchId: string,
  employerId: string,
): { batch: PayrollBatch; items: PublicPayrollItem[] } {
  const batch = stmts.getBatch().get(batchId) as PayrollBatch | undefined;
  if (!batch || batch.employer_id !== employerId) {
    throw new PayrollError(`Batch ${batchId} not found`);
  }

  return {
    batch,
    items: (stmts.getBatchItems().all(batchId) as PayrollItem[]).map((item) => ({
      id: item.id,
      batch_id: item.batch_id,
      employee_id: item.employee_id,
      amount: item.amount,
      commitment: item.commitment,
      status: item.status,
      claimed_at: item.claimed_at,
      withdraw_tx_hash: item.withdraw_tx_hash,
      withdrawal_address: item.withdrawal_address,
    })),
  };
}

export function getBatchClaimDistribution(
  batchId: string,
  employerId: string,
): BatchClaimDistribution[] {
  const batch = stmts.getBatch().get(batchId) as PayrollBatch | undefined;
  if (!batch || batch.employer_id !== employerId) {
    throw new PayrollError(`Batch ${batchId} not found`);
  }

  const rows = stmts.getBatchItems().all(batchId) as PayrollItem[];

  return rows.map((row) => {
    if (!row.encrypted_data) {
      throw new PayrollError(`Claim payload missing for payroll item ${row.id}`);
    }

    const payload = decryptClaimPayload(row.encrypted_data);
    return {
      itemId: row.id,
      employeeId: row.employee_id,
      employeeName: payload.employeeName,
      walletAddress: payload.walletAddress,
      amount: row.amount,
      claimKey: payload.claimKey,
      claimKeyLast4: payload.claimKey.slice(-4),
      status: row.status,
    };
  }).sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}

export function getDashboardStats(employerId: string): DashboardStats {
  const batches = stmts.getEmployerBatches().all(employerId) as PayrollBatch[];
  const completedBatches = batches.filter((batch) => batch.status === 'completed');
  const totalPaid = completedBatches.reduce((sum, batch) => sum + batch.total_amount, 0);
  const distinctEmployees =
    (stmts.getDistinctEmployeeCount().get(employerId) as { employee_count: number } | undefined)
      ?.employee_count ?? 0;
  const lastBatch = completedBatches[0];

  return {
    totalPaid,
    employeeCount: distinctEmployees,
    batchCount: batches.length,
    completedBatches: completedBatches.length,
    pendingBatches: batches.filter((batch) => batch.status !== 'completed').length,
    averagePayment: distinctEmployees > 0 ? totalPaid / distinctEmployees : 0,
    lastPayrollDate: lastBatch?.created_at ?? null,
  };
}

export function getClaimRecordBySecretKey(secretKey: string): ResolvedClaimRecord | null {
  const row = stmts.getClaimByHash().get(hashClaimKey(secretKey.trim())) as ClaimLookupRow | undefined;
  if (!row || !row.nullifier || !row.encrypted_data) {
    return null;
  }

  const payload = decryptClaimPayload(row.encrypted_data);

  return {
    itemId: row.id,
    employeeId: row.employee_id,
    employeeName: payload.employeeName,
    walletAddress: payload.walletAddress,
    amount: row.amount,
    batchId: row.batch_id,
    batchStatus: row.batch_status,
    claimStatus: row.status,
    claimable: row.status === 'pending' && row.batch_status === 'completed',
    createdAt: row.batch_created_at,
    nullifier: row.nullifier,
    employerId: row.employer_id,
  };
}

export function verifyClaimKey(secretKey: string): ClaimVerificationResult | null {
  const claim = getClaimRecordBySecretKey(secretKey);
  if (!claim) {
    return null;
  }

  const { nullifier: _nullifier, employerId: _employerId, ...result } = claim;
  return result;
}

export function markClaimAsWithdrawn(
  itemId: string,
  txHash: string,
  withdrawalAddress: string,
): void {
  const finishWithdrawal = db.transaction(() => {
    const result = stmts.markClaimed().run(txHash, withdrawalAddress, itemId);
    if (result.changes !== 1) {
      throw new PayrollError('The payroll claim is no longer available for withdrawal.');
    }
    stmts.releaseWithdrawalLock().run(itemId);
  });
  finishWithdrawal();
}

export function acquireClaimWithdrawalLock(itemId: string): boolean {
  const acquire = db.transaction(() => {
    stmts.clearStaleWithdrawalLocks().run();
    return stmts.acquireWithdrawalLock().run(itemId).changes === 1;
  });
  return acquire();
}

export function releaseClaimWithdrawalLock(itemId: string): void {
  stmts.releaseWithdrawalLock().run(itemId);
}

export class PayrollError extends Error {
  public details: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'PayrollError';
    this.details = details;
  }
}
