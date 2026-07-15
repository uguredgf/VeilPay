// ── Core Types ────────────────────────────────────────────────

export interface Employee {
  id: string;
  name: string;
  walletAddress: string;
  department: string;
  salary: number;
  status: 'active' | 'inactive' | 'pending';
  hireDate: string;
  secretKey?: string;
  claimed?: boolean;
}

export interface SecretKeyInfo {
  employeeId: string;
  name: string;
  walletAddress: string;
  amount: number;
  secretKey: string;
}

export interface PayrollBatch {
  id: string;
  batchNumber: string;
  date: string;
  totalAmount: number;
  employeeCount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  proofHash: string;
  proofStatus: 'valid' | 'invalid' | 'pending';
  txHash?: string;
  gasUsed?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'payroll' | 'refund';
  amount: number;
  date: string;
  description: string;
  txHash: string;
  from: string;
  to: string;
  status: 'completed' | 'pending' | 'failed';
  isShielded: boolean;
}

export interface ComplianceRecord {
  id: string;
  type: 'proof_verification' | 'allowlist_add' | 'allowlist_remove' | 'blocklist_add' | 'blocklist_remove' | 'audit';
  action: string;
  description: string;
  date: string;
  status: 'success' | 'warning' | 'error';
  actor: string;
  details?: string;
}

export interface AllowlistEntry {
  id: string;
  address: string;
  label: string;
  addedDate: string;
  addedBy: string;
  type: 'allow' | 'deny';
}

export interface ZKProof {
  id: string;
  batchId: string;
  proofHash: string;
  verificationStatus: 'valid' | 'invalid' | 'pending';
  timestamp: string;
  proofType: string;
  proves: string[];
  circuitId: string;
}

export interface CSVRow {
  employee: string;
  walletAddress: string;
  amount: number;
  department: string;
}

export interface WalletState {
  isConnected: boolean;
  address: string;
  balance: number;
  network: string;
}

export type UserRole = 'employer' | 'employee' | 'compliance';

export interface StatCardData {
  label: string;
  value: string;
  trend?: {
    direction: 'up' | 'down';
    percentage: string;
  };
  icon: string;
  accent: 'cyan' | 'purple' | 'emerald' | 'rose' | 'amber';
}
