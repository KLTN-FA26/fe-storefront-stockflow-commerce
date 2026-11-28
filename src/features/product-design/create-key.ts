// The Idempotency-Key of a design create (`POST /designs/mine`), kept in `sessionStorage` so that a
// reload of `/design/new` before it redirects replays the same request instead of making a second
// draft (the BE's idempotency filter answers a repeated key with the first result, or 409
// `IDEMPOTENT_REQUEST_IN_PROGRESS` while it still runs). One key per link (product + sku + project).

import { hasErrorCode } from "@/lib/api/describe-error";

import { isTransientFailure } from "./quote-request-errors";

const PREFIX = "sf.design.create-key:";

/**
 * Whether the same Idempotency-Key may be sent again after this failure: the network, the server
 * (5xx) or 409 `IDEMPOTENT_REQUEST_IN_PROGRESS` leave the request's fate open; any other answer
 * (a 4xx) is stored by the BE for the key and replayed, so it needs a new key.
 */
export const isRetryableWithSameKey = (error: unknown) =>
  isTransientFailure(error) || hasErrorCode(error, "IDEMPOTENT_REQUEST_IN_PROGRESS");

/** The key of this link's create: the one kept from an earlier load, else a new one (kept). */
export function createKeyFor(scope: string): string {
  try {
    const kept = window.sessionStorage.getItem(PREFIX + scope);
    if (kept) return kept;
  } catch {
    // storage blocked: a key that lives only in this load
  }
  const fresh = crypto.randomUUID();
  try {
    window.sessionStorage.setItem(PREFIX + scope, fresh);
  } catch {
    // see above
  }
  return fresh;
}

/** Whether a create of this link is already under way in this tab (a reload before the redirect replays it). */
export function hasCreateKey(scope: string): boolean {
  try {
    return window.sessionStorage.getItem(PREFIX + scope) !== null;
  } catch {
    return false;
  }
}

/** Forget the key: after the redirect, or after an answer the BE stores for good (a 4xx). */
export function forgetCreateKey(scope: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + scope);
  } catch {
    // nothing kept
  }
}
