import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  Copy,
  Check,
  Download,
  ArrowRight,
  ArrowLeft,
  Users,
  DollarSign,
  Globe,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import {
  getSystemHealth,
  executePayroll,
  getPayrollHistory,
  type ClaimDistribution,
  type MidnightExecutionReadiness,
  type PayrollBatch,
  type PayrollPreviewRow,
  uploadPayrollCsv,
} from '../api/client';
import { formatCurrency, formatDate } from '../utils/format';

function escapeCsvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export default function EmployerDashboard() {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<PayrollPreviewRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedSecrets, setGeneratedSecrets] = useState<ClaimDistribution[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentBatches, setRecentBatches] = useState<PayrollBatch[]>([]);
  const [executionReadiness, setExecutionReadiness] = useState<MidnightExecutionReadiness | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalAmount = useMemo(
    () => parsedRows.reduce((sum, row) => sum + row.amount, 0),
    [parsedRows],
  );

  useEffect(() => {
    void loadHistory();
    void loadSystemHealth();
  }, []);

  async function loadHistory(): Promise<void> {
    try {
      setRecentBatches(await getPayrollHistory());
    } catch (historyError) {
      setError((historyError as Error).message);
    }
  }

  async function loadSystemHealth(): Promise<void> {
    try {
      const health = await getSystemHealth();
      setExecutionReadiness(health.executionReadiness);
    } catch (healthError) {
      setError((healthError as Error).message);
    }
  }

  async function handleFileSelect(file: File): Promise<void> {
    setIsUploading(true);
    setError(null);
    setCsvFile(file);

    try {
      const response = await uploadPayrollCsv(file);
      setBatchId(response.batch.id);
      setParsedRows(response.preview);
    } catch (uploadError) {
      setBatchId(null);
      setParsedRows([]);
      setError((uploadError as Error).message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleExecute(): Promise<void> {
    if (!batchId) {
      setError('No payroll batch is ready for execution.');
      return;
    }
    if (executionReadiness && !executionReadiness.currentModeAllowsExecution) {
      setError(executionReadiness.message);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await executePayroll(batchId);
      setGeneratedSecrets(response.claims);
      setStep(3);
      await loadHistory();
    } catch (executionError) {
      setError((executionError as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }

  function handleCopyKey(key: string): void {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  }

  function handleDownloadKeys(): void {
    const header = 'Employee,Wallet Address,Amount,Claim Key\n';
    const rows = generatedSecrets
      .map((secret) => [
        secret.employeeName,
        secret.walletAddress,
        secret.amount,
        secret.claimKey,
      ].map(escapeCsvCell).join(','))
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'veilpay-claim-keys.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTemplate(): void {
    const template = [
      'name,wallet_address,amount,department',
      'Ada Lovelace,0x1111111111111111111111111111111111111111,8200,Engineering',
      'Alan Turing,0x2222222222222222222222222222222222222222,9100,Research',
    ].join('\n');
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'veilpay-payroll-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleReset(): void {
    setStep(1);
    setCsvFile(null);
    setBatchId(null);
    setParsedRows([]);
    setGeneratedSecrets([]);
    setCopiedKey(null);
    setError(null);
  }

  function statusBadge(status: PayrollBatch['status']) {
    const className =
      status === 'completed'
        ? 'badge badge-success'
        : status === 'failed'
          ? 'badge badge-error'
          : 'badge badge-warning';
    return <span className={className}>{status}</span>;
  }

  return (
    <div className="fade-in">
      <div className="wizard-steps" style={{ marginBottom: 32 }}>
        <div className={`wizard-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
          <span className="wizard-step-num">1</span>
          Upload
        </div>
        <span className="wizard-step-line" />
        <div className={`wizard-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>
          <span className="wizard-step-num">2</span>
          Review &amp; Execute
        </div>
        <span className="wizard-step-line" />
        <div className={`wizard-step ${step >= 3 ? 'active' : ''}`}>
          <span className="wizard-step-num">3</span>
          Distribute Keys
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card fade-in" id="upload">
          <h2 style={{ margin: '0 0 4px' }}>Upload Employee Roster</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Import a production CSV with `name`, `wallet_address`, `amount`, and optional `department`.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFileSelect(file);
              }
            }}
          />

          <div
            className="upload-zone"
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) {
                void handleFileSelect(file);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <span className="spinner" />
                <p style={{ margin: '12px 0 0', fontWeight: 500 }}>Validating payroll CSV...</p>
              </>
            ) : parsedRows.length === 0 ? (
              <>
                <Upload size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>Drop your employee roster CSV here</p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>
                  or click to browse
                </p>
              </>
            ) : (
              <>
                <CheckCircle size={40} style={{ color: 'var(--success)', marginBottom: 12 }} />
                <p style={{ margin: 0, fontWeight: 500 }}>
                  <FileText size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  {csvFile?.name}
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
                  {parsedRows.length} employee{parsedRows.length !== 1 ? 's' : ''} validated
                </p>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
            {parsedRows.length > 0 && (
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Continue <ArrowRight size={16} />
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleDownloadTemplate} style={{ fontSize: 14 }}>
              <Download size={14} /> Download CSV Template
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 20px' }}>Review Payroll</h2>

            {executionReadiness && (
              <div
                style={{
                  marginBottom: 20,
                  padding: 14,
                  borderRadius: 12,
                  border: `1px solid ${
                    executionReadiness.simulatedTransactions ? 'var(--warning)' : 'var(--error)'
                  }`,
                  background: executionReadiness.simulatedTransactions
                    ? 'var(--warning-dim)'
                    : 'var(--error-dim)',
                  color: executionReadiness.simulatedTransactions
                    ? 'var(--warning)'
                    : 'var(--error)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <AlertCircle size={16} />
                  <strong>
                    {executionReadiness.simulatedTransactions
                      ? 'Simulation mode active'
                      : 'Real Midnight execution unavailable'}
                  </strong>
                </div>
                <div style={{ fontSize: 14 }}>{executionReadiness.message}</div>
              </div>
            )}

            <div className="stat-row">
              <div className="stat-card">
                <span className="stat-label">
                  <DollarSign size={14} /> Total Amount
                </span>
                <span className="stat-value">{formatCurrency(totalAmount)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">
                  <Users size={14} /> Employees
                </span>
                <span className="stat-value">{parsedRows.length}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">
                  <Globe size={14} /> Network
                </span>
                <span className="stat-value" style={{ fontSize: 18 }}>
                  Midnight
                </span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Wallet</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => (
                    <tr key={`${row.wallet_address}-${row.name}`}>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td className="mono" style={{ color: 'var(--text-secondary)' }}>
                        {row.wallet_address}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td>
                        <span className="badge badge-neutral">{row.department ?? 'General'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void handleExecute()}
              disabled={isProcessing || Boolean(executionReadiness && !executionReadiness.currentModeAllowsExecution)}
            >
              {isProcessing ? (
                <>
                  <span className="spinner" /> Executing payroll...
                </>
              ) : (
                executionReadiness?.simulatedTransactions
                  ? 'Execute Payroll (Simulation)'
                  : 'Execute Payroll'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="fade-in">
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: '0 0 4px' }}>Claim keys generated</h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px' }}>
              Share each key privately with the corresponding employee.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {generatedSecrets.map((secret) => (
                <div className="secret-key-box" key={secret.itemId}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>{secret.employeeName}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {formatCurrency(secret.amount)}
                    </div>
                  </div>
                  <span className="secret-key-value">{secret.claimKey}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleCopyKey(secret.claimKey)}
                    title="Copy key"
                  >
                    {copiedKey === secret.claimKey ? (
                      <Check size={16} style={{ color: 'var(--success)' }} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={handleDownloadKeys}>
                <Download size={16} /> Download All Keys (CSV)
              </button>
              <button className="btn btn-ghost" onClick={handleReset}>
                <RotateCcw size={16} /> Start New Batch
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 40 }} id="history">
        <h3 style={{ margin: '0 0 16px' }}>Recent Batches</h3>
        <div className="card-flat">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Employees</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBatches.map((batch) => (
                  <tr key={batch.id}>
                    <td className="mono" style={{ fontWeight: 500 }}>
                      {batch.id.slice(0, 12)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDate(batch.created_at)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatCurrency(batch.total_amount)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{batch.employee_count}</td>
                    <td>{statusBadge(batch.status)}</td>
                  </tr>
                ))}
                {recentBatches.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">No payroll batches have been created yet.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
