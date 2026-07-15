import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Wallet, Copy, LogOut, AlertCircle, ExternalLink } from 'lucide-react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  MIDNIGHT_NETWORK_CANDIDATES,
  MIDNIGHT_NETWORK_ID,
} from '../config';
import {
  getWalletSession,
  setWalletSession,
  subscribeToWalletSession,
} from '../wallet/session';

const LACE_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/lace/gafhhkghbfjjkeiendhlofajokpaflmk';

function truncate(address: string): string {
  if (address.length <= 14) {
    return address;
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getAvailableWallets(): InitialAPI[] {
  if (!window.midnight) {
    return [];
  }
  return Object.values(window.midnight);
}

function isRetryableNetworkError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes('network id mismatch') || message.includes('invalid network id');
}

const WalletConnect: React.FC = () => {
  const [wallets, setWallets] = useState<InitialAPI[]>([]);
  const walletSession = useSyncExternalStore(
    subscribeToWalletSession,
    getWalletSession,
    getWalletSession,
  );
  const address = walletSession?.address ?? null;
  const walletName = walletSession?.walletName ?? '';
  const networkId = walletSession?.networkId ?? MIDNIGHT_NETWORK_ID;
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setWallets(getAvailableWallets());
    check();
    const firstTimer = window.setTimeout(check, 500);
    const secondTimer = window.setTimeout(check, 1500);
    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const connect = useCallback(async (wallet: InitialAPI) => {
    setConnecting(true);
    setError(null);

    try {
      const networkErrors: string[] = [];

      for (const candidateNetworkId of MIDNIGHT_NETWORK_CANDIDATES) {
        try {
          const connected: ConnectedAPI = await wallet.connect(candidateNetworkId);
          const connectionStatus = await connected.getConnectionStatus();
          if (connectionStatus.status !== 'connected') {
            throw new Error('Wallet returned a disconnected state after connect().');
          }

          const { shieldedAddress } = await connected.getShieldedAddresses();
          setWalletSession({
            address: shieldedAddress,
            walletName: wallet.name,
            networkId: connectionStatus.networkId,
          });
          return;
        } catch (candidateError) {
          if (candidateError === 'PermissionRejected') {
            throw candidateError;
          }

          if (isRetryableNetworkError(candidateError)) {
            networkErrors.push(`${candidateNetworkId}: ${String(candidateError)}`);
            continue;
          }

          throw candidateError;
        }
      }

      throw new Error(
        `Compatible network not found. Tried: ${MIDNIGHT_NETWORK_CANDIDATES.join(', ')}. Details: ${networkErrors.join(' | ')}`,
      );
    } catch (connectError) {
      if (connectError === 'PermissionRejected') {
        setError('Connection rejected by wallet');
      } else {
        setError(`Connection failed: ${String(connectError)}`);
      }
      console.error('Wallet connection error:', connectError);
    } finally {
      setConnecting(false);
    }
  }, []);

  function disconnect(): void {
    setWalletSession(null);
    setDropdownOpen(false);
  }

  function copyAddress(): void {
    if (!address) {
      return;
    }
    navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (wallets.length === 0 && !address) {
    return (
      <a
        href={LACE_EXTENSION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="wallet-btn"
        title="Install Lace Wallet extension to connect"
      >
        <Wallet size={15} />
        <span>Install Lace</span>
        <ExternalLink size={12} style={{ opacity: 0.5 }} />
      </a>
    );
  }

  if (!address) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        {wallets.length === 1 ? (
          <button
            className="wallet-btn"
            onClick={() => void connect(wallets[0])}
            disabled={connecting}
          >
            <Wallet size={15} />
            {connecting ? 'Connecting...' : `Connect ${wallets[0].name}`}
          </button>
        ) : (
          <>
            <button
              className="wallet-btn"
              onClick={() => setDropdownOpen((current) => !current)}
              disabled={connecting}
            >
              <Wallet size={15} />
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '0.35rem',
                  minWidth: '200px',
                  zIndex: 100,
                }}
              >
                {wallets.map((wallet) => (
                  <button
                    key={wallet.rdns}
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem' }}
                    onClick={() => {
                      void connect(wallet);
                      setDropdownOpen(false);
                    }}
                  >
                    {wallet.icon && (
                      <img
                        src={wallet.icon}
                        alt=""
                        style={{ width: 16, height: 16, borderRadius: 3 }}
                      />
                    )}
                    {wallet.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: 'var(--error-dim)',
              border: '1px solid var(--error)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '0.78rem',
              color: 'var(--error)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              zIndex: 100,
            }}
          >
            <AlertCircle size={13} /> {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="wallet-btn" onClick={() => setDropdownOpen((current) => !current)}>
        <span className="wallet-dot connected" />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }}>
          {truncate(address)}
        </span>
        <Wallet size={15} />
      </button>

      {dropdownOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.35rem',
            minWidth: '180px',
            zIndex: 100,
          }}
        >
          {walletName && (
            <div
              style={{
                padding: '6px 10px',
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
                marginBottom: '0.25rem',
              }}
            >
              {walletName} · {networkId}
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem' }}
            onClick={copyAddress}
          >
            <Copy size={13} /> {copied ? 'Copied!' : 'Copy Address'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem', color: 'var(--error)' }}
            onClick={disconnect}
          >
            <LogOut size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
