export interface WalletSession {
  address: string;
  walletName: string;
  networkId: string;
  providerRdns: string;
  apiVersion: string;
}

let currentSession: WalletSession | null = null;
const listeners = new Set<() => void>();

export function getWalletSession(): WalletSession | null {
  return currentSession;
}

export function setWalletSession(session: WalletSession | null): void {
  currentSession = session;
  listeners.forEach((listener) => listener());
}

export function subscribeToWalletSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
