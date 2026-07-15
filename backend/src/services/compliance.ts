/**
 * VeilPay — Compliance business-logic service.
 *
 * Handles regulatory compliance checks, allowlist / blocklist management,
 * ZK compliance proof generation & verification, and audit trail queries.
 */

import { v4 as uuid } from 'uuid';
import db, { logAudit } from '../database/init.js';
import midnightService from './midnight.js';
import type {
  ComplianceRecord,
  ComplianceOverviewBatch,
  ComplianceOverviewStats,
  AllowlistEntry,
  BlocklistEntry,
  AuditLog,
  AuditFilter,
  ZKProof,
  PayrollBatch,
  PayrollItem,
} from '../types/index.js';
import { normalizeWalletAddress } from '../utils/wallet-address.js';

// ────────────────────────────────────────────────────────────────────────────
// Prepared statements
// ────────────────────────────────────────────────────────────────────────────

const stmts = {
  insertCompliance: () =>
    db.prepare(`
      INSERT INTO compliance_records (id, batch_id, proof_hash, compliance_status)
      VALUES (?, ?, ?, ?)
    `),

  getComplianceByBatch: () =>
    db.prepare('SELECT * FROM compliance_records WHERE batch_id = ? ORDER BY checked_at DESC LIMIT 1'),

  getBatch: () =>
    db.prepare('SELECT * FROM payroll_batches WHERE id = ?'),

  getBatchItems: () =>
    db.prepare('SELECT * FROM payroll_items WHERE batch_id = ?'),

  getComplianceOverviewRows: () =>
    db.prepare(`
      SELECT
        pb.id AS batch_id,
        pb.created_at,
        pb.total_amount,
        pb.employee_count,
        pb.status AS payroll_status,
        cr.proof_hash,
        cr.compliance_status,
        cr.checked_at
      FROM payroll_batches pb
      LEFT JOIN compliance_records cr
        ON cr.id = (
          SELECT id
          FROM compliance_records latest
          WHERE latest.batch_id = pb.id
          ORDER BY latest.checked_at DESC
          LIMIT 1
        )
      ORDER BY pb.created_at DESC
    `),

  // Allowlist
  insertAllow: () =>
    db.prepare('INSERT INTO allowlist (id, address, added_by) VALUES (?, ?, ?)'),
  deleteAllow: () =>
    db.prepare('DELETE FROM allowlist WHERE address = ?'),
  getAllow: () =>
    db.prepare('SELECT * FROM allowlist ORDER BY added_at DESC'),
  findAllow: () =>
    db.prepare('SELECT * FROM allowlist WHERE address = ?'),

  // Blocklist
  insertBlock: () =>
    db.prepare('INSERT INTO blocklist (id, address, reason, added_by) VALUES (?, ?, ?, ?)'),
  deleteBlock: () =>
    db.prepare('DELETE FROM blocklist WHERE address = ?'),
  getBlock: () =>
    db.prepare('SELECT * FROM blocklist ORDER BY added_at DESC'),
  findBlock: () =>
    db.prepare('SELECT * FROM blocklist WHERE address = ?'),
};

// ────────────────────────────────────────────────────────────────────────────
// Compliance checks
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run a compliance check on a payroll batch.
 *
 * Checks:
 *  1. No recipient is on the blocklist.
 *  2. All recipients are on the allowlist (if allowlist is non-empty).
 *  3. Individual amounts are within the compliance threshold.
 *  4. A ZK compliance proof can be generated.
 */
export async function checkCompliance(batchId: string): Promise<ComplianceRecord> {
  const batch = stmts.getBatch().get(batchId) as PayrollBatch | undefined;
  if (!batch) throw new ComplianceError(`Batch ${batchId} not found`);
  if (batch.status !== 'completed') {
    throw new ComplianceError(`Batch ${batchId} must be completed before compliance checking.`);
  }

  const items = stmts.getBatchItems().all(batchId) as PayrollItem[];
  const threshold = Number(process.env.COMPLIANCE_THRESHOLD ?? '10000');
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new ComplianceError('COMPLIANCE_THRESHOLD must be a positive number.');
  }
  const issues: string[] = [];

  // 1. Blocklist check — look up employees to get wallet addresses
  for (const item of items) {
    const emp = db.prepare('SELECT wallet_address FROM employees WHERE id = ?').get(item.employee_id) as { wallet_address: string } | undefined;
    if (emp) {
      const blocked = stmts.findBlock().get(emp.wallet_address) as BlocklistEntry | undefined;
      if (blocked) {
        issues.push(`Blocked address ${emp.wallet_address}: ${blocked.reason}`);
      }
    }
  }

  // 2. Allowlist check (only if the allowlist is populated)
  const allowlist = stmts.getAllow().all() as AllowlistEntry[];
  if (allowlist.length > 0) {
    const allowedAddresses = new Set(allowlist.map((a) => a.address.toLowerCase()));
    for (const item of items) {
      const emp = db.prepare('SELECT wallet_address FROM employees WHERE id = ?').get(item.employee_id) as { wallet_address: string } | undefined;
      if (emp && !allowedAddresses.has(emp.wallet_address.toLowerCase())) {
        issues.push(`Address ${emp.wallet_address} is not on the allowlist.`);
      }
    }
  }

  // 3. Threshold check
  for (const item of items) {
    if (item.amount > threshold) {
      issues.push(`Payment of ${item.amount} exceeds threshold ${threshold} (item ${item.id}).`);
    }
  }

  // 4. Determine status
  let status: ComplianceRecord['compliance_status'];
  if (issues.length === 0) {
    status = 'passed';
  } else if (issues.some((i) => i.startsWith('Blocked'))) {
    status = 'failed';
  } else {
    status = 'review_required';
  }

  // 5. Generate a clearly labelled simulation proof fingerprint.
  const proofHash = status === 'passed'
    ? `sim_proof_${(await midnightService.generateProof('compliance_check', {
        batchId,
        totalAmount: batch.total_amount,
      })).proof.slice(0, 48)}`
    : null;

  const id = uuid();
  stmts.insertCompliance().run(id, batchId, proofHash, status);

  logAudit(
    uuid(),
    'compliance.check',
    'system',
    `Batch ${batchId}: ${status}${issues.length > 0 ? ' — ' + issues.join('; ') : ''}`,
  );

  return stmts.getComplianceByBatch().get(batchId) as ComplianceRecord;
}

/**
 * Generate a standalone ZK compliance proof for a batch.
 */
export async function generateComplianceProof(batchId: string): Promise<ZKProof> {
  const batch = stmts.getBatch().get(batchId) as PayrollBatch | undefined;
  if (!batch) throw new ComplianceError(`Batch ${batchId} not found`);
  if (batch.status !== 'completed') {
    throw new ComplianceError(`Batch ${batchId} must be completed before proof generation.`);
  }

  const proof = await midnightService.generateProof('compliance_proof', {
    batchId,
    totalAmount: batch.total_amount,
    employeeCount: batch.employee_count,
    commitmentRoot: batch.commitment_root,
  });

  logAudit(uuid(), 'compliance.proof.generated', 'system', `Batch ${batchId}`);
  return proof;
}

/**
 * Get the latest compliance status for a batch.
 */
export function getComplianceStatus(batchId: string): ComplianceRecord | null {
  return (stmts.getComplianceByBatch().get(batchId) as ComplianceRecord) ?? null;
}

export function getComplianceOverview(): {
  batches: ComplianceOverviewBatch[];
  stats: ComplianceOverviewStats;
} {
  const batches = stmts.getComplianceOverviewRows().all() as Array<{
    batch_id: string;
    created_at: string;
    total_amount: number;
    employee_count: number;
    payroll_status: PayrollBatch['status'];
    proof_hash: string | null;
    compliance_status: ComplianceRecord['compliance_status'] | null;
    checked_at: string | null;
  }>;

  const overviewBatches: ComplianceOverviewBatch[] = batches.map((batch) => ({
    batchId: batch.batch_id,
    createdAt: batch.created_at,
    totalAmount: batch.total_amount,
    employeeCount: batch.employee_count,
    payrollStatus: batch.payroll_status,
    complianceStatus: batch.compliance_status ?? 'unchecked',
    proofHash: batch.proof_hash,
    checkedAt: batch.checked_at,
  }));

  const checkedBatches = overviewBatches.filter((batch) => batch.complianceStatus !== 'unchecked');
  const passedBatches = overviewBatches.filter((batch) => batch.complianceStatus === 'passed').length;
  const reviewRequiredBatches = overviewBatches.filter(
    (batch) => batch.complianceStatus === 'review_required',
  ).length;
  const failedBatches = overviewBatches.filter((batch) => batch.complianceStatus === 'failed').length;

  return {
    batches: overviewBatches,
    stats: {
      totalBatches: overviewBatches.length,
      checkedBatches: checkedBatches.length,
      passedBatches,
      reviewRequiredBatches,
      failedBatches,
      complianceRate:
        checkedBatches.length > 0 ? Math.round((passedBatches / checkedBatches.length) * 100) : 0,
      lastCheckDate: checkedBatches[0]?.checkedAt ?? null,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Allowlist management
// ────────────────────────────────────────────────────────────────────────────

export function addToAllowlist(address: string, addedBy: string): AllowlistEntry {
  const normalizedAddress = normalizeWalletAddress(address);
  const existing = stmts.findAllow().get(normalizedAddress) as AllowlistEntry | undefined;
  if (existing) throw new ComplianceError(`Address ${normalizedAddress} is already on the allowlist.`);
  if (stmts.findBlock().get(normalizedAddress)) {
    throw new ComplianceError(`Address ${normalizedAddress} must be removed from the blocklist first.`);
  }

  const id = uuid();
  stmts.insertAllow().run(id, normalizedAddress, addedBy);
  logAudit(uuid(), 'allowlist.add', addedBy, normalizedAddress);
  return stmts.findAllow().get(normalizedAddress) as AllowlistEntry;
}

export function removeFromAllowlist(address: string): void {
  const normalizedAddress = normalizeWalletAddress(address);
  const result = stmts.deleteAllow().run(normalizedAddress);
  if (result.changes === 0) throw new ComplianceError(`Address ${normalizedAddress} not found on allowlist.`);
  logAudit(uuid(), 'allowlist.remove', 'system', normalizedAddress);
}

// ────────────────────────────────────────────────────────────────────────────
// Blocklist management
// ────────────────────────────────────────────────────────────────────────────

export function addToBlocklist(address: string, reason: string, addedBy: string): BlocklistEntry {
  const normalizedAddress = normalizeWalletAddress(address);
  const existing = stmts.findBlock().get(normalizedAddress) as BlocklistEntry | undefined;
  if (existing) throw new ComplianceError(`Address ${normalizedAddress} is already on the blocklist.`);
  if (stmts.findAllow().get(normalizedAddress)) {
    throw new ComplianceError(`Address ${normalizedAddress} must be removed from the allowlist first.`);
  }

  const id = uuid();
  stmts.insertBlock().run(id, normalizedAddress, reason, addedBy);
  logAudit(uuid(), 'blocklist.add', addedBy, `${normalizedAddress} — ${reason}`);
  return stmts.findBlock().get(normalizedAddress) as BlocklistEntry;
}

export function removeFromBlocklist(address: string): void {
  const normalizedAddress = normalizeWalletAddress(address);
  const result = stmts.deleteBlock().run(normalizedAddress);
  if (result.changes === 0) throw new ComplianceError(`Address ${normalizedAddress} not found on blocklist.`);
  logAudit(uuid(), 'blocklist.remove', 'system', normalizedAddress);
}

// ────────────────────────────────────────────────────────────────────────────
// Lists & Audit
// ────────────────────────────────────────────────────────────────────────────

export function getLists(): { allowlist: AllowlistEntry[]; blocklist: BlocklistEntry[] } {
  return {
    allowlist: stmts.getAllow().all() as AllowlistEntry[],
    blocklist: stmts.getBlock().all() as BlocklistEntry[],
  };
}

export function getAuditTrail(filters: AuditFilter = {}): AuditLog[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.action) {
    conditions.push('action = ?');
    params.push(filters.action);
  }
  if (filters.actor) {
    conditions.push('actor = ?');
    params.push(filters.actor);
  }
  if (filters.from) {
    conditions.push('timestamp >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('timestamp <= ?');
    params.push(filters.to);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const sql = `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  return db.prepare(sql).all(...params, limit, offset) as AuditLog[];
}

// ────────────────────────────────────────────────────────────────────────────
// Error class
// ────────────────────────────────────────────────────────────────────────────

export class ComplianceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceError';
  }
}
