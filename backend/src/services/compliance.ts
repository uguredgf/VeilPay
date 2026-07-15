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
import { decryptClaimPayload } from '../utils/crypto.js';

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
    db.prepare(`
      SELECT cr.*
      FROM compliance_records cr
      JOIN payroll_batches pb ON pb.id = cr.batch_id
      WHERE cr.batch_id = ? AND pb.employer_id = ?
      ORDER BY cr.checked_at DESC
      LIMIT 1
    `),

  getBatch: () =>
    db.prepare('SELECT * FROM payroll_batches WHERE id = ? AND employer_id = ?'),

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
      WHERE pb.employer_id = ?
      ORDER BY pb.created_at DESC
    `),

  // Allowlist
  insertAllow: () =>
    db.prepare(`
      INSERT INTO workspace_allowlist (id, workspace_id, address, added_by)
      VALUES (?, ?, ?, ?)
    `),
  deleteAllow: () =>
    db.prepare('DELETE FROM workspace_allowlist WHERE workspace_id = ? AND address = ?'),
  getAllow: () =>
    db.prepare('SELECT * FROM workspace_allowlist WHERE workspace_id = ? ORDER BY added_at DESC'),
  findAllow: () =>
    db.prepare('SELECT * FROM workspace_allowlist WHERE workspace_id = ? AND address = ?'),

  // Blocklist
  insertBlock: () =>
    db.prepare(`
      INSERT INTO workspace_blocklist (id, workspace_id, address, reason, added_by)
      VALUES (?, ?, ?, ?, ?)
    `),
  deleteBlock: () =>
    db.prepare('DELETE FROM workspace_blocklist WHERE workspace_id = ? AND address = ?'),
  getBlock: () =>
    db.prepare('SELECT * FROM workspace_blocklist WHERE workspace_id = ? ORDER BY added_at DESC'),
  findBlock: () =>
    db.prepare('SELECT * FROM workspace_blocklist WHERE workspace_id = ? AND address = ?'),
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
export async function checkCompliance(
  batchId: string,
  workspaceId: string,
): Promise<ComplianceRecord> {
  const batch = stmts.getBatch().get(batchId, workspaceId) as PayrollBatch | undefined;
  if (!batch) throw new ComplianceError(`Batch ${batchId} not found`);
  if (batch.status !== 'completed') {
    throw new ComplianceError(`Batch ${batchId} must be completed before compliance checking.`);
  }

  const items = stmts.getBatchItems().all(batchId) as PayrollItem[];
  const recipientAddresses = items.map((item) => {
    if (!item.encrypted_data) {
      throw new ComplianceError(`Encrypted recipient data is missing for item ${item.id}.`);
    }
    try {
      return normalizeWalletAddress(decryptClaimPayload(item.encrypted_data).walletAddress);
    } catch {
      throw new ComplianceError(`Encrypted recipient data is invalid for item ${item.id}.`);
    }
  });
  const threshold = Number(process.env.COMPLIANCE_THRESHOLD ?? '10000');
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new ComplianceError('COMPLIANCE_THRESHOLD must be a positive number.');
  }
  const issues: string[] = [];

  // 1. Blocklist check against addresses decrypted only for this operation.
  for (const address of recipientAddresses) {
    const blocked = stmts.findBlock().get(workspaceId, address) as BlocklistEntry | undefined;
    if (blocked) {
      issues.push(`Blocked address ${address}: ${blocked.reason}`);
    }
  }

  // 2. Allowlist check (only if the allowlist is populated)
  const allowlist = stmts.getAllow().all(workspaceId) as AllowlistEntry[];
  if (allowlist.length > 0) {
    const allowedAddresses = new Set(allowlist.map((a) => a.address.toLowerCase()));
    for (const address of recipientAddresses) {
      if (!allowedAddresses.has(address.toLowerCase())) {
        issues.push(`Address ${address} is not on the allowlist.`);
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
    workspaceId,
    `Batch ${batchId}: ${status}${issues.length > 0 ? ' — ' + issues.join('; ') : ''}`,
  );

  return stmts.getComplianceByBatch().get(batchId, workspaceId) as ComplianceRecord;
}

/**
 * Generate a standalone ZK compliance proof for a batch.
 */
export async function generateComplianceProof(
  batchId: string,
  workspaceId: string,
): Promise<ZKProof> {
  const batch = stmts.getBatch().get(batchId, workspaceId) as PayrollBatch | undefined;
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

  logAudit(uuid(), 'compliance.proof.generated', workspaceId, `Batch ${batchId}`);
  return proof;
}

/**
 * Get the latest compliance status for a batch.
 */
export function getComplianceStatus(batchId: string, workspaceId: string): ComplianceRecord | null {
  return (stmts.getComplianceByBatch().get(batchId, workspaceId) as ComplianceRecord) ?? null;
}

export function getComplianceOverview(workspaceId: string): {
  batches: ComplianceOverviewBatch[];
  stats: ComplianceOverviewStats;
} {
  const batches = stmts.getComplianceOverviewRows().all(workspaceId) as Array<{
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

export function addToAllowlist(
  address: string,
  addedBy: string,
  workspaceId: string,
): AllowlistEntry {
  const normalizedAddress = normalizeWalletAddress(address);
  const existing = stmts.findAllow().get(workspaceId, normalizedAddress) as AllowlistEntry | undefined;
  if (existing) throw new ComplianceError(`Address ${normalizedAddress} is already on the allowlist.`);
  if (stmts.findBlock().get(workspaceId, normalizedAddress)) {
    throw new ComplianceError(`Address ${normalizedAddress} must be removed from the blocklist first.`);
  }

  const id = uuid();
  stmts.insertAllow().run(id, workspaceId, normalizedAddress, addedBy);
  logAudit(uuid(), 'allowlist.add', workspaceId, `${addedBy}: ${normalizedAddress}`);
  return stmts.findAllow().get(workspaceId, normalizedAddress) as AllowlistEntry;
}

export function removeFromAllowlist(address: string, workspaceId: string): void {
  const normalizedAddress = normalizeWalletAddress(address);
  const result = stmts.deleteAllow().run(workspaceId, normalizedAddress);
  if (result.changes === 0) throw new ComplianceError(`Address ${normalizedAddress} not found on allowlist.`);
  logAudit(uuid(), 'allowlist.remove', workspaceId, normalizedAddress);
}

// ────────────────────────────────────────────────────────────────────────────
// Blocklist management
// ────────────────────────────────────────────────────────────────────────────

export function addToBlocklist(
  address: string,
  reason: string,
  addedBy: string,
  workspaceId: string,
): BlocklistEntry {
  const normalizedAddress = normalizeWalletAddress(address);
  const existing = stmts.findBlock().get(workspaceId, normalizedAddress) as BlocklistEntry | undefined;
  if (existing) throw new ComplianceError(`Address ${normalizedAddress} is already on the blocklist.`);
  if (stmts.findAllow().get(workspaceId, normalizedAddress)) {
    throw new ComplianceError(`Address ${normalizedAddress} must be removed from the allowlist first.`);
  }

  const id = uuid();
  stmts.insertBlock().run(id, workspaceId, normalizedAddress, reason, addedBy);
  logAudit(uuid(), 'blocklist.add', workspaceId, `${addedBy}: ${normalizedAddress} - ${reason}`);
  return stmts.findBlock().get(workspaceId, normalizedAddress) as BlocklistEntry;
}

export function removeFromBlocklist(address: string, workspaceId: string): void {
  const normalizedAddress = normalizeWalletAddress(address);
  const result = stmts.deleteBlock().run(workspaceId, normalizedAddress);
  if (result.changes === 0) throw new ComplianceError(`Address ${normalizedAddress} not found on blocklist.`);
  logAudit(uuid(), 'blocklist.remove', workspaceId, normalizedAddress);
}

// ────────────────────────────────────────────────────────────────────────────
// Lists & Audit
// ────────────────────────────────────────────────────────────────────────────

export function getLists(workspaceId: string): { allowlist: AllowlistEntry[]; blocklist: BlocklistEntry[] } {
  return {
    allowlist: stmts.getAllow().all(workspaceId) as AllowlistEntry[],
    blocklist: stmts.getBlock().all(workspaceId) as BlocklistEntry[],
  };
}

export function getAuditTrail(workspaceId: string, filters: AuditFilter = {}): AuditLog[] {
  const conditions: string[] = ['actor = ?'];
  const params: unknown[] = [workspaceId];

  if (filters.action) {
    conditions.push('action = ?');
    params.push(filters.action);
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
