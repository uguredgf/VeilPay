export const API_BASE = '/api';
export const MIDNIGHT_NETWORK_ID =
  (import.meta.env.VITE_MIDNIGHT_NETWORK_ID as string | undefined)?.trim() || 'testnet';
const DEFAULT_MIDNIGHT_NETWORKS = [
  MIDNIGHT_NETWORK_ID,
  'testnet',
  'devnet',
  'preprod',
  'preview',
  'qanet',
  'undeployed',
  'mainnet',
];
export const MIDNIGHT_NETWORK_CANDIDATES = Array.from(
  new Set(
    (
      (import.meta.env.VITE_MIDNIGHT_NETWORK_IDS as string | undefined)?.split(',') ??
      DEFAULT_MIDNIGHT_NETWORKS
    )
      .map((networkId) => networkId.trim())
      .filter(Boolean),
  ),
);
