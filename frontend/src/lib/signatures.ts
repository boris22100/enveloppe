const STORAGE_KEY = 'enveloppe_signatures_v1';

export function getSignaturesMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getAccountSignature(accountId: string | null): string {
  if (!accountId) return '';
  return getSignaturesMap()[accountId] || '';
}

export function setAccountSignature(accountId: string, signature: string): void {
  if (typeof localStorage === 'undefined' || !accountId) return;
  const map = getSignaturesMap();
  if (signature.trim()) {
    map[accountId] = signature;
  } else {
    delete map[accountId];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
