const SIGNATURES_STORE = 'enveloppe_signatures_v1';

export function getSignaturesMap(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SIGNATURES_STORE);
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
  localStorage.setItem(SIGNATURES_STORE, JSON.stringify(map));
}
