const DEMO_HEX_ADDRESS_RE = /^(0x)?[0-9a-f]{40,64}$/;
const MIDNIGHT_BECH32M_RE =
  /^mn_(?:shield-addr|addr)_[a-z0-9-]+1[023456789acdefghjklmnpqrstuvwxyz]{20,300}$/;

export function normalizeWalletAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isSupportedWalletAddress(address: string): boolean {
  const normalized = normalizeWalletAddress(address);
  return DEMO_HEX_ADDRESS_RE.test(normalized) || MIDNIGHT_BECH32M_RE.test(normalized);
}
