const STORAGE_KEY = 'veilpay.private-demo-workspace.v1';
let memoryToken: string | null = null;

function generateWorkspaceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getOrCreateWorkspaceToken(): string {
  if (memoryToken) {
    return memoryToken;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{43}$/.test(stored)) {
      memoryToken = stored;
      return stored;
    }

    const token = generateWorkspaceToken();
    localStorage.setItem(STORAGE_KEY, token);
    memoryToken = token;
    return token;
  } catch {
    memoryToken = generateWorkspaceToken();
    return memoryToken;
  }
}
