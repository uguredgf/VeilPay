import { API_BASE } from '../config';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

export interface MidnightExecutionReadiness {
  mode: 'strict' | 'simulation';
  currentModeAllowsExecution: boolean;
  readyForRealTransactions: boolean;
  simulatedTransactions: boolean;
  message: string;
  requirements: string[];
}

export interface SystemHealth {
  status: string;
  service: string;
  version: string;
  network: string;
  connected: boolean;
  mode: 'strict' | 'simulation';
  executionReadiness: MidnightExecutionReadiness;
  uptime: number;
  timestamp: string;
}

export interface PayrollPreviewRow {
  name: string;
  wallet_address: string;
  amount: number;
  department?: string;
}

export interface PayrollBatch {
  id: string;
  employer_id: string;
  total_amount: number;
  employee_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tx_hash: string | null;
  commitment_root: string | null;
  created_at: string;
}

export interface ClaimDistribution {
  itemId: string;
  employeeId: string;
  employeeName: string;
  walletAddress: string;
  amount: number;
  claimKey: string;
  claimKeyLast4: string;
  status: 'pending' | 'claimed' | 'expired';
}

export interface UploadPayrollResponse {
  batch: PayrollBatch;
  preview: PayrollPreviewRow[];
  rowCount: number;
}

export interface ExecutePayrollResponse {
  batch: PayrollBatch;
  claims: ClaimDistribution[];
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

export interface ClaimVerificationResult {
  itemId: string;
  employeeId: string;
  employeeName: string;
  walletAddress: string;
  amount: number;
  batchId: string;
  batchStatus: 'pending' | 'processing' | 'completed' | 'failed';
  claimStatus: 'pending' | 'claimed' | 'expired';
  claimable: boolean;
  createdAt: string;
}

export interface WithdrawClaimResponse {
  txHash: string;
  amount: number;
  walletAddress: string;
  status: 'claimed';
}

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

export interface ComplianceOverviewBatch {
  batchId: string;
  createdAt: string;
  totalAmount: number;
  employeeCount: number;
  payrollStatus: 'pending' | 'processing' | 'completed' | 'failed';
  complianceStatus: 'unchecked' | 'pending' | 'passed' | 'failed' | 'review_required';
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

export interface ComplianceOverviewResponse {
  batches: ComplianceOverviewBatch[];
  stats: ComplianceOverviewStats;
}

export interface ComplianceRecord {
  id: string;
  batch_id: string;
  proof_hash: string | null;
  compliance_status: 'pending' | 'passed' | 'failed' | 'review_required';
  checked_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  details: string | null;
  timestamp: string;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const rawBody = await response.text();
  if (!rawBody.trim()) {
    if (response.status >= 500) {
      throw new Error('Backend API unavailable. Start the backend server on http://localhost:3001 and try again.');
    }
    throw new Error(`Empty response body (HTTP ${response.status})`);
  }

  let body: ApiResponse<T>;
  try {
    body = JSON.parse(rawBody) as ApiResponse<T>;
  } catch {
    const preview = rawBody.slice(0, 160);
    throw new Error(`Invalid JSON response (HTTP ${response.status}): ${preview}`);
  }

  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }
  return body.data;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      ...init,
      headers: {
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
    });
    return parseResponse<T>(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Backend API unavailable')
    ) {
      throw new Error('Backend API unavailable. Start the backend server on http://localhost:3001 and try again.');
    }
    throw error;
  }
}

export async function uploadPayrollCsv(file: File, employerId: string): Promise<UploadPayrollResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('employerId', employerId);
  return request<UploadPayrollResponse>('/employer/payroll/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function executePayroll(batchId: string): Promise<ExecutePayrollResponse> {
  return request<ExecutePayrollResponse>('/employer/payroll/execute', {
    method: 'POST',
    body: JSON.stringify({ batchId }),
  });
}

export async function getPayrollHistory(employerId: string): Promise<PayrollBatch[]> {
  const data = await request<{ batches: PayrollBatch[] }>(
    `/employer/payroll/history?employerId=${encodeURIComponent(employerId)}`,
  );
  return data.batches;
}

export async function getDashboardStats(employerId: string): Promise<DashboardStats> {
  return request<DashboardStats>(
    `/employer/dashboard/stats?employerId=${encodeURIComponent(employerId)}`,
  );
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return request<SystemHealth>('/health');
}

export async function verifyClaimKey(secretKey: string): Promise<ClaimVerificationResult> {
  return request<ClaimVerificationResult>('/employee/claim/verify', {
    method: 'POST',
    body: JSON.stringify({ secretKey }),
  });
}

export async function withdrawClaim(
  secretKey: string,
  walletAddress: string,
): Promise<WithdrawClaimResponse> {
  return request<WithdrawClaimResponse>('/employee/claim/withdraw', {
    method: 'POST',
    body: JSON.stringify({ secretKey, walletAddress }),
  });
}

export async function getComplianceOverview(): Promise<ComplianceOverviewResponse> {
  return request<ComplianceOverviewResponse>('/compliance/overview');
}

export async function runComplianceCheck(batchId: string): Promise<ComplianceRecord> {
  return request<ComplianceRecord>('/compliance/check', {
    method: 'POST',
    body: JSON.stringify({ batchId }),
  });
}

export async function getComplianceLists(): Promise<{
  allowlist: AllowlistEntry[];
  blocklist: BlocklistEntry[];
}> {
  return request<{ allowlist: AllowlistEntry[]; blocklist: BlocklistEntry[] }>('/compliance/lists');
}

export async function addAllowlistEntry(address: string, addedBy: string): Promise<AllowlistEntry> {
  return request<AllowlistEntry>('/compliance/allowlist', {
    method: 'POST',
    body: JSON.stringify({ address, addedBy }),
  });
}

export async function removeAllowlistEntry(address: string): Promise<{ removed: string }> {
  return request<{ removed: string }>(`/compliance/allowlist/${encodeURIComponent(address)}`, {
    method: 'DELETE',
  });
}

export async function addBlocklistEntry(
  address: string,
  reason: string,
  addedBy: string,
): Promise<BlocklistEntry> {
  return request<BlocklistEntry>('/compliance/blocklist', {
    method: 'POST',
    body: JSON.stringify({ address, reason, addedBy }),
  });
}

export async function removeBlocklistEntry(address: string): Promise<{ removed: string }> {
  return request<{ removed: string }>(`/compliance/blocklist/${encodeURIComponent(address)}`, {
    method: 'DELETE',
  });
}

export async function getAuditTrail(): Promise<AuditLog[]> {
  const data = await request<{ logs: AuditLog[]; count: number }>('/compliance/audit');
  return data.logs;
}
