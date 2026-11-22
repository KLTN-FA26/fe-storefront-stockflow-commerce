import { STORE_ROUTES } from "@/constants";
import { NOTIFICATION_CONFIG } from "@/constants/notifications";

// Printable ASCII without space. Anything else — tab/CR/LF (stripped by the URL parser, so
// "/\t/evil" would become "//evil"), DEL, Unicode look-alikes — is refused, not cleaned.
const PATH_CHARS = /^[\x21-\x7E]+$/;
// Encoded separators and dots decode back into `/`, `\` or `..` in later routing layers.
const ENCODED_SEPARATOR = /%(2f|5c|2e)/i;
// Throwaway origin: only used to let the URL parser canonicalize, never navigated to.
const PROBE_ORIGIN = "https://notification.invalid";

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * Canonical in-app target of a notification `link`, or null when it is not a plain root-relative
 * storefront path. BE (V20261014000400 ck_user_notification_link) only promises `/%` and not
 * `//%`; this is the stricter client policy (SCRUM-147): no absolute, protocol-relative, backslash
 * or dot-segment trick, and never a back-office (`/admin`) or BFF (`/api`) path.
 */
export function toSafeNotificationPath(raw: string): string | null {
  if (raw.length > NOTIFICATION_CONFIG.maxLinkLength || !PATH_CHARS.test(raw)) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PROBE_ORIGIN || ENCODED_SEPARATOR.test(url.pathname)) return null;
  const path = url.pathname;
  if (NOTIFICATION_CONFIG.blockedPathPrefixes.some((prefix) => isUnder(path, prefix))) return null;
  return `${path}${url.search}${url.hash}`;
}

const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

/**
 * BE links that name a page the storefront keeps elsewhere, and where it is. Only these exact shapes
 * are rewritten, so an already-correct link and every other path pass unchanged (`/einvoices/{id}`
 * and `/chat/{id}` are storefront pages as the BE writes them).
 * - `/orders/{id}`: VehicleHandoverNotificationListener; the page is `/account/orders/{id}`.
 * - `/designs/{id}`: DesignDecisionNotificationListener before R5-1 (now `/design/{id}`); notices
 *   already stored keep the old link (SF-UX-13).
 */
const BE_LINKS: readonly { pattern: RegExp; to: (id: string) => string }[] = [
  { pattern: new RegExp(`^/orders/${UUID}$`, "i"), to: STORE_ROUTES.account.orders.detail },
  { pattern: new RegExp(`^/designs/${UUID}$`, "i"), to: STORE_ROUTES.design.detail },
];

/** Safe in-app target of a notification link, with BE-side links mapped to the storefront route. */
export function resolveNotificationLink(raw: string): string | null {
  const safe = toSafeNotificationPath(raw);
  if (safe === null) return null;
  for (const { pattern, to } of BE_LINKS) {
    const id = pattern.exec(safe)?.[1];
    if (id) return to(id);
  }
  return safe;
}
