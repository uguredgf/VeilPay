/**
 * VeilPay — Core TypeScript type definitions.
 *
 * All domain entities, request/response shapes, and service-layer types
 * are centralised here so that every module shares a single source of truth.
 */

// ────────────────────────────────────────────────────────────────────────────
// Employee
// ────────────────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  wallet_address: string;
  department: string | null;
  status: EmployeeStatus;
  created_at: string;
}

export type EmployeeStatus = 'active' | 'inactive' | 'suspended';

// ────────────────────────────────────────────────────────────────────────────
// Payroll Batch
// ────────────────────────────────────────────────────────────────────────────

export interface PayrollBatch {
  id: string;
  employer_id: string;
  total_amount: number;
  employee_count: number;
  status: PayrollBatchStatus;
  tx_hash: string | null;
  commitment_root: string | null;
  created_at: string;
}

export type PayrollBatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ────────────────────────────────────────────────────────────────────────────
// Payroll Item (one payment inside a batch)
// ────────────────────────────────────────────────────────────────────────────

export interface PayrollItem {
  id: string;
  batch_id: string;
  employee_id: string;
  amount: number;
  commitment: string | null;
  nullifier: string | null;
  status: PayrollItemStatus;
  claim_key_hash: string | null;
  encrypted_data: string | null;
  claimed_at?: string | null;
  withdraw_tx_hash?: string | null;
  withdrawal_address?: string | null;
}

export type PayrollItemStatus = 'pending' | 'claimed' | 'expired';

// ────────────────────────────────────────────────────────────────────────────
// Compliance
// ────────────────────────────────────────────────────────────────────────────

export interface ComplianceRecord {
  id: string;
  batch_id: string;
  proof_hash: string | null;
  compliance_status: ComplianceStatus;
  checked_at: string;
}

export type ComplianceStatus = 'pending' | 'passed' | 'failed' | 'review_required';

export interface AllowlistEntry {
  id: string;
  address: string;
  added_by: string;
  added_at: string;
}

export interface BlocklistEntry {
  id: string;
  address: string;
  reason: string;
  added_by: string;
  added_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Audit
// ────────────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  details: string | null;
  timestamp: string;
}

export interface AuditFilter {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Midnight SDK abstractions
// ────────────────────────────────────────────────────────────────────────────

export interface MidnightNetworkConfig {
  network: 'mainnet' | 'testnet' | 'devnet' | 'qanet' | 'undeployed' | 'preview' | 'preprod';
  indexerUrl: string;
  nodeUrl: string;
  proofServerUrl: string;
  walletSeed?: string;
}

export interface MidnightExecutionReadiness {
  mode: 'strict' | 'simulation';
  currentModeAllowsExecution: boolean;
  readyForRealTransactions: boolean;
  simulatedTransactions: boolean;
  message: string;
  requirements: string[];
}

export interface DeployResult {
  contractId: string;
  txHash: string;
  address: string;
  deployedAt: string;
}

export interface CircuitCallResult {
  txHash: string;
  publicOutputs: Record<string, unknown>;
  proof: string;
  executedAt: string;
}

export interface ZKProof {
  proof: string;
  publicInputs: Record<string, unknown>;
  circuitName: string;
  generatedAt: string;
  verified?: boolean;
}

export interface TransactionStatus {
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  blockHeight: number | null;
  confirmations: number;
  timestamp: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// CSV / upload
// ────────────────────────────────────────────────────────────────────────────

export interface CSVPayrollRow {
  name: string;
  wallet_address: string;
  amount: number;
  department?: string;
}

export interface CSVParseResult {
  items: CSVPayrollRow[];
  errors: CSVValidationError[];
  valid: boolean;
}

export interface CSVValidationError {
  row: number;
  field: string;
  message: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Crypto / Merkle helpers
// ────────────────────────────────────────────────────────────────────────────

export interface MerkleTree {
  root: string;
  leaves: string[];
  layers: string[][];
  depth: number;
}

export interface MerkleProof {
  leaf: string;
  index: number;
  siblings: string[];
  root: string;
}

// ────────────────────────────────────────────────────────────────────────────
// API response wrappers
// ────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface DashboardStats {
  totalPaid: number;
  employeeCount: number;
  batchCount: number;
  completedBatches: number;
  pendingBatches: number;
  averagePayment: number;
  lastPayrollDate: string | null;
}

export interface EmployeeBalance {
  address: string;
  available: number;
  pending: number;
  totalReceived: number;
}

export interface WithdrawRequest {
  address: string;
  amount: number;
  proof: string;
  nullifier: string;
}

export interface ClaimPayload {
  claimKey: string;
  employeeId: string;
  employeeName: string;
  walletAddress: string;
  batchId: string;
  amount: number;
  generatedAt: string;
}

export interface BatchClaimDistribution {
  itemId: string;
  employeeId: string;
  employeeName: string;
  walletAddress: string;
  amount: number;
  claimKey: string;
  claimKeyLast4: string;
  status: PayrollItemStatus;
}

export interface ClaimVerificationResult {
  itemId: string;
  employeeId: string;
  employeeName: string;
  walletAddress: string;
  amount: number;
  batchId: string;
  batchStatus: PayrollBatchStatus;
  claimStatus: PayrollItemStatus;
  claimable: boolean;
  createdAt: string;
}

export interface ComplianceOverviewBatch {
  batchId: string;
  createdAt: string;
  totalAmount: number;
  employeeCount: number;
  payrollStatus: PayrollBatchStatus;
  complianceStatus: ComplianceStatus | 'unchecked';
  proofHash: string | null;
  checkedAt: string | null;
}

export interface ComplianceOverviewStats {
  totalBatches: number;
  checkedBatches: number;
  passedBatches: number;
  reviewRequiredBatches: number;
  failedBatches: number;
  complianceRate: number;
  lastCheckDate: string | null;
}
