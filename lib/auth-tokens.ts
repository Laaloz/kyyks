export const RESET_TOKEN_EXPIRY_MINUTES = 30;
export const INVITE_EXPIRY_DAYS = 7;

export function addMinutesIso(baseIso: string, minutes: number) {
  return new Date(new Date(baseIso).getTime() + minutes * 60_000).toISOString();
}

export function addDaysIso(baseIso: string, days: number) {
  return new Date(new Date(baseIso).getTime() + days * 24 * 60 * 60_000).toISOString();
}

export function isTimestampExpired(value: string) {
  return new Date(value).getTime() <= Date.now();
}

export function createSecureToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashToken(token: string) {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
