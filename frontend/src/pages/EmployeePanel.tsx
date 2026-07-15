import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  KeyRound,
  CheckCircle,
  Wallet,
  ArrowDownToLine,
  RotateCcw,
  ShieldCheck,
  Send,
  AlertCircle,
} from 'lucide-react';
import {
  getSystemHealth,
  verifyClaimKey,
  withdrawClaim,
  type ClaimVerificationResult,
  type MidnightExecutionReadiness,
} from '../api/client';
import { formatCurrency, formatDateTime, truncateAddress } from '../utils/format';
import { getWalletSession, subscribeToWalletSession } from '../wallet/session';

export default function EmployeePanel() {
  const [secretInput, setSecretInput] = useState('');
  const [claimResult, setClaimResult] = useState<ClaimVerificationResult | null>(null);
  const walletSession = useSyncExternalStore(
    subscribeToWalletSession,
    getWalletSession,
    getWalletSession,
  );
  const walletAddress = walletSession?.address ?? null;
  const [isVerifying, setIsVerifying] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawDone, setWithdrawDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [executionReadiness, setExecutionReadiness] = useState<MidnightExecutionReadiness | null>(null);

  useEffect(() => {
    const loadSystemHealth = async () => {
      try {
        const health = await getSystemHealth();
        setExecutionReadiness(health.executionReadiness);
      } catch (healthError) {
        setError((healthError as Error).message);
      }
    };

    void loadSystemHealth();
  }, []);

  async function handleVerify(): Promise<void> {
    if (!secretInput.trim()) {
      return;
    }

    setIsVerifying(true);
    setError(null);
    setWithdrawDone(false);
    setTxHash(null);

    try {
      setClaimResult(await verifyClaimKey(secretInput.trim()));
    } catch (verifyError) {
      setClaimResult(null);
      setError((verifyError as Error).message);
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleWithdraw(): Promise<void> {
    if (!walletAddress || !claimResult) {
      setError('Connect your Midnight wallet before withdrawing funds.');
      return;
    }
    if (executionReadiness && !executionReadiness.currentModeAllowsExecution) {
      setError(executionReadiness.message);
      return;
    }

    setIsWithdrawing(true);
    setError(null);

    try {
      const result = await withdrawClaim(secretInput.trim(), walletAddress);
      setTxHash(result.txHash);
      setWithdrawDone(true);
    } catch (withdrawError) {
      setError((withdrawError as Error).message);
    } finally {
      setIsWithdrawing(false);
    }
  }

  function handleReset(): void {
    setSecretInput('');
    setClaimResult(null);
    setIsVerifying(false);
    setIsWithdrawing(false);
    setWithdrawDone(false);
    setError(null);
    setTxHash(null);
  }

  const canWithdraw = Boolean(walletAddress && claimResult?.claimable && claimResult.claimStatus === 'pending');

  return (
    <div className="fade-in">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Claim Your Salary</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, maxWidth: 460, marginInline: 'auto' }}>
          Enter the claim secret key provided by your employer, then withdraw to your connected Midnight wallet.
        </p>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative' }}>
            <KeyRound
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              className="input input-lg input-mono"
              type="text"
              value={secretInput}
              onChange={(event) => setSecretInput(event.target.value)}
              placeholder="Enter your claim secret key..."
              onKeyDown={(event) => event.key === 'Enter' && void handleVerify()}
              style={{ paddingLeft: 42, width: '100%' }}
            />
          </div>
        </div>

        {executionReadiness && (
          <div
            style={{
              background: executionReadiness.simulatedTransactions
                ? 'var(--warning-dim)'
                : 'var(--error-dim)',
              border: `1px solid ${
                executionReadiness.simulatedTransactions ? 'var(--warning)' : 'var(--error)'
              }`,
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              color: executionReadiness.simulatedTransactions ? 'var(--warning)' : 'var(--error)',
              marginBottom: 16,
            }}
          >
            <AlertCircle size={16} style={{ marginTop: 2 }} />
            <span>{executionReadiness.message}</span>
          </div>
        )}

        <div
          className="card-flat"
          style={{
            marginBottom: 16,
            padding: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>Connected wallet</div>
            <div className="mono" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {walletAddress ? truncateAddress(walletAddress) : 'No Midnight wallet connected'}
            </div>
          </div>
          <span className={`badge ${walletAddress ? 'badge-success' : 'badge-warning'}`}>
            {walletAddress ? 'ready' : 'wallet required'}
          </span>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--error-dim)',
              border: '1px solid var(--error)',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--error)',
              marginBottom: 16,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {!claimResult && (
          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={() => void handleVerify()}
            disabled={isVerifying || !secretInput.trim()}
          >
            {isVerifying ? (
              <>
                <span className="spinner" /> Verifying...
              </>
            ) : (
              <>
                <ShieldCheck size={18} /> Verify Key
              </>
            )}
          </button>
        )}

        {claimResult && (
          <div className="fade-in" style={{ marginTop: 24 }}>
            {!withdrawDone ? (
              <>
                <div
                  style={{
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: 24,
                    textAlign: 'center',
                    marginBottom: 20,
                  }}
                >
                  <CheckCircle size={32} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>{claimResult.employeeName}</div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      margin: '8px 0',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {formatCurrency(claimResult.amount)}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                    Issued {formatDateTime(claimResult.createdAt)}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span
                      className={`badge ${
                        claimResult.claimable ? 'badge-success' : 'badge-warning'
                      }`}
                    >
                      {claimResult.claimable ? 'claimable' : claimResult.batchStatus}
                    </span>
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  onClick={() => void handleWithdraw()}
                  disabled={
                    isWithdrawing ||
                    !canWithdraw ||
                    Boolean(executionReadiness && !executionReadiness.currentModeAllowsExecution)
                  }
                >
                  {isWithdrawing ? (
                    <>
                      <span className="spinner" /> Processing withdrawal...
                    </>
                  ) : (
                    <>
                      <Wallet size={18} />{' '}
                      {executionReadiness?.simulatedTransactions
                        ? 'Withdraw to Wallet (Simulation)'
                        : 'Withdraw to Wallet'}
                    </>
                  )}
                </button>

                {!walletAddress && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
                    Connect your Midnight wallet from the top bar to unlock withdrawal.
                  </p>
                )}
              </>
            ) : (
              <div
                style={{
                  background: 'var(--success-dim)',
                  border: '1px solid var(--success)',
                  borderRadius: 10,
                  padding: 32,
                  textAlign: 'center',
                }}
              >
                <CheckCircle size={44} style={{ color: 'var(--success)', marginBottom: 12 }} />
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                  Funds discharged to your wallet
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  {formatCurrency(claimResult.amount)} has been sent to {walletAddress ? truncateAddress(walletAddress) : 'your wallet'}.
                </div>
                {txHash && (
                  <div className="mono" style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                    TX {txHash}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {claimResult && (
          <button
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 16 }}
            onClick={handleReset}
          >
            <RotateCcw size={16} /> Start Over
          </button>
        )}
      </div>

      <div style={{ marginTop: 56, maxWidth: 800, marginInline: 'auto' }} id="how-it-works">
        <h3 style={{ textAlign: 'center', margin: '0 0 24px', color: 'var(--text-secondary)' }}>
          How it works
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div className="card-flat" style={{ textAlign: 'center', padding: 24 }}>
            <Send size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>1. Receive Key</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Your employer issues a one-time claim key after the payroll batch settles.
            </p>
          </div>
          <div className="card-flat" style={{ textAlign: 'center', padding: 24 }}>
            <ShieldCheck size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>2. Verify</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              VeilPay validates the claim key against the payroll batch and amount assigned to you.
            </p>
          </div>
          <div className="card-flat" style={{ textAlign: 'center', padding: 24 }}>
            <ArrowDownToLine size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>3. Withdraw</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
              Withdraw the funds directly to your connected Midnight wallet once the batch is finalized.
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: '40vh' }} />
    </div>
  );
}
