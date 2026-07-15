import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  X,
  Search,
  Shield,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  addAllowlistEntry,
  addBlocklistEntry,
  getAuditTrail,
  getComplianceLists,
  getComplianceOverview,
  removeAllowlistEntry,
  removeBlocklistEntry,
  runComplianceCheck,
  type AllowlistEntry,
  type AuditLog,
  type BlocklistEntry,
  type ComplianceOverviewBatch,
  type ComplianceOverviewStats,
} from '../api/client';
import { formatCurrency, formatDate, formatDateTime, truncateHash } from '../utils/format';

type AuditFilter = 'all' | 'proofs' | 'lists' | 'audits';

const DEFAULT_ACTOR = 'compliance@veilpay.local';

export default function CompliancePanel() {
  const [batches, setBatches] = useState<ComplianceOverviewBatch[]>([]);
  const [stats, setStats] = useState<ComplianceOverviewStats | null>(null);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [checkingBatch, setCheckingBatch] = useState<string | null>(null);
  const [newAllowAddress, setNewAllowAddress] = useState('');
  const [newBlockAddress, setNewBlockAddress] = useState('');
  const [newBlockReason, setNewBlockReason] = useState('');
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadComplianceData();
  }, []);

  async function loadComplianceData(): Promise<void> {
    setIsLoading(true);
    setError(null);

    try {
      const [overview, lists, logs] = await Promise.all([
        getComplianceOverview(),
        getComplianceLists(),
        getAuditTrail(),
      ]);

      setBatches(overview.batches);
      setStats(overview.stats);
      setAllowlist(lists.allowlist);
      setBlocklist(lists.blocklist);
      setAuditLogs(logs);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCheckBatch(batchId: string): Promise<void> {
    setCheckingBatch(batchId);
    setError(null);

    try {
      await runComplianceCheck(batchId);
      await loadComplianceData();
    } catch (checkError) {
      setError((checkError as Error).message);
    } finally {
      setCheckingBatch(null);
    }
  }

  async function handleAddAllow(): Promise<void> {
    if (!newAllowAddress.trim()) {
      return;
    }

    try {
      await addAllowlistEntry(newAllowAddress.trim(), DEFAULT_ACTOR);
      setNewAllowAddress('');
      await loadComplianceData();
    } catch (addError) {
      setError((addError as Error).message);
    }
  }

  async function handleRemoveAllow(address: string): Promise<void> {
    try {
      await removeAllowlistEntry(address);
      await loadComplianceData();
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  }

  async function handleAddBlock(): Promise<void> {
    if (!newBlockAddress.trim() || !newBlockReason.trim()) {
      return;
    }

    try {
      await addBlocklistEntry(newBlockAddress.trim(), newBlockReason.trim(), DEFAULT_ACTOR);
      setNewBlockAddress('');
      setNewBlockReason('');
      await loadComplianceData();
    } catch (addError) {
      setError((addError as Error).message);
    }
  }

  async function handleRemoveBlock(address: string): Promise<void> {
    try {
      await removeBlocklistEntry(address);
      await loadComplianceData();
    } catch (removeError) {
      setError((removeError as Error).message);
    }
  }

  const filteredRecords = useMemo(() => {
    if (auditFilter === 'all') {
      return auditLogs;
    }
    if (auditFilter === 'proofs') {
      return auditLogs.filter((record) => record.action.startsWith('compliance.'));
    }
    if (auditFilter === 'lists') {
      return auditLogs.filter((record) => record.action.startsWith('allowlist.') || record.action.startsWith('blocklist.'));
    }
    return auditLogs.filter((record) => record.action.includes('audit'));
  }, [auditFilter, auditLogs]);

  function statusBadge(status: string) {
    const className =
      status === 'passed' || status === 'completed'
        ? 'badge badge-success'
        : status === 'failed'
          ? 'badge badge-error'
          : status === 'review_required'
            ? 'badge badge-warning'
            : 'badge badge-neutral';
    return <span className={className}>{status}</span>;
  }

  return (
    <div className="fade-in">
      {error && (
        <div className="card" style={{ borderColor: 'var(--error)', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ margin: '0 0 20px' }}>Batch Compliance</h2>

        <div className="stat-row" style={{ marginBottom: 24 }}>
          <div className="stat-card">
            <span className="stat-label">
              <Shield size={14} /> Checked Batches
            </span>
            <span className="stat-value">{stats?.checkedBatches ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">
              <Check size={14} /> Compliance Rate
            </span>
            <span className="stat-value">{stats?.complianceRate ?? 0}%</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">
              <Clock size={14} /> Last Check Date
            </span>
            <span className="stat-value" style={{ fontSize: 16 }}>
              {stats?.lastCheckDate ? formatDate(stats.lastCheckDate) : '-'}
            </span>
          </div>
        </div>

        <div className="card-flat">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Compliance</th>
                  <th>Proof</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.batchId}>
                    <td className="mono" style={{ fontWeight: 500 }}>
                      {truncateHash(batch.batchId, 12)}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDate(batch.createdAt)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatCurrency(batch.totalAmount)}
                    </td>
                    <td>{statusBadge(batch.complianceStatus)}</td>
                    <td className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {batch.proofHash ? truncateHash(batch.proofHash, 12) : '-'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void handleCheckBatch(batch.batchId)}
                        disabled={checkingBatch === batch.batchId || isLoading}
                      >
                        {checkingBatch === batch.batchId ? (
                          <span className="spinner" />
                        ) : (
                          <>
                            <Search size={14} /> Check
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">No payroll batches available for compliance review.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="lists" style={{ marginBottom: 48 }}>
        <h2 style={{ margin: '0 0 20px' }}>Address Lists</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Check size={18} style={{ color: 'var(--success)' }} />
              <h3 style={{ margin: 0 }}>Allowlist</h3>
              <span className="badge badge-neutral" style={{ marginLeft: 'auto' }}>
                {allowlist.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Wallet address"
                value={newAllowAddress}
                onChange={(event) => setNewAllowAddress(event.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => void handleAddAllow()}>
                <Plus size={14} />
              </button>
            </div>

            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Added By</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {allowlist.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {entry.address}
                      </td>
                      <td>{entry.added_by}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleRemoveAllow(entry.address)}
                          title="Remove"
                        >
                          <Trash2 size={14} style={{ color: 'var(--error)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <X size={18} style={{ color: 'var(--error)' }} />
              <h3 style={{ margin: 0 }}>Blocklist</h3>
              <span className="badge badge-neutral" style={{ marginLeft: 'auto' }}>
                {blocklist.length}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Wallet address"
                value={newBlockAddress}
                onChange={(event) => setNewBlockAddress(event.target.value)}
                style={{ flex: 2 }}
              />
              <input
                className="input"
                placeholder="Reason"
                value={newBlockReason}
                onChange={(event) => setNewBlockReason(event.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn btn-danger btn-sm" onClick={() => void handleAddBlock()}>
                <Plus size={14} />
              </button>
            </div>

            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Address</th>
                    <th>Reason</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {blocklist.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        {entry.address}
                      </td>
                      <td>{entry.reason}</td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => void handleRemoveBlock(entry.address)}
                          title="Remove"
                        >
                          <Trash2 size={14} style={{ color: 'var(--error)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section id="audit">
        <h2 style={{ margin: '0 0 20px' }}>Audit Log</h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['all', 'proofs', 'lists', 'audits'] as AuditFilter[]).map((filter) => (
            <button
              key={filter}
              className={`btn btn-sm ${auditFilter === filter ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setAuditFilter(filter)}
            >
              {filter === 'all' && 'All'}
              {filter === 'proofs' && 'Proofs'}
              {filter === 'lists' && 'Lists'}
              {filter === 'audits' && 'Audits'}
            </button>
          ))}
        </div>

        <div className="card-flat">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Date</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{record.action}</td>
                    <td
                      style={{
                        color: 'var(--text-secondary)',
                        maxWidth: 360,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={record.details ?? undefined}
                    >
                      {record.details ?? '-'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      {formatDateTime(record.timestamp)}
                    </td>
                    <td className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {record.actor}
                    </td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <span className="empty-state-icon">
                          <AlertTriangle size={24} />
                        </span>
                        No audit records match this filter.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
