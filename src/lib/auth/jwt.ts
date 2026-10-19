/**
 * The client only reads the `exp` of its own access token, to stop sending (and to sign out of) a
 * token the BE would refuse anyway. It is not verified here: the BE verifies the signature, and
 * nothing in the UI trusts any other claim.
 */
export function readJwtExpiry(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(atob(padded));
    const exp = (claims as { exp?: unknown } | null)?.exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** A few seconds early, so a request is not sent a moment before the BE would refuse it. */
const SKEW_MS = 10_000;

/** False when the token carries no readable `exp`: the BE then decides (401). */
export function isTokenExpired(token: string, now = Date.now()): boolean {
  const expiry = readJwtExpiry(token);
  return expiry !== undefined && expiry - SKEW_MS <= now;
}
