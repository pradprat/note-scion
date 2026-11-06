// Signed session cookie for the single-user workspace.
// Value: "<expiry ms>.<base64url HMAC-SHA256(expiry)>". Web Crypto only, so the same
// code runs in edge middleware and in node server actions.

export const SESSION_COOKIE = "notes_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const encoder = new TextEncoder();

function secret(): string | null {
  const value = process.env.NOTES_SESSION_SECRET;
  return value && value.length >= 16 ? value : null;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  new Uint8Array(bytes).forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionValue(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("NOTES_SESSION_SECRET is missing or shorter than 16 characters");
  const expiry = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expiry}.${await hmac(key, expiry)}`;
}

export async function verifySessionValue(value: string | undefined): Promise<boolean> {
  const key = secret();
  if (!key || !value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiry = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
  return constantTimeEqual(signature, await hmac(key, expiry));
}
