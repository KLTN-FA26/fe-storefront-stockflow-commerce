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

// BE VehicleHandoverNotificationListener links the order as `/orders/{id}`; the storefront page for
// it is `/account/orders/{id}` (STORE_ROUTES.account.orders.detail). Only that exact shape is
// rewritten, so an already-correct `/account/orders/...` link and every other path pass unchanged.
const BE_ORDER_LINK = /^\/orders\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Safe in-app target of a notification link, with BE-side order links mapped to the storefront route. */
export function resolveNotificationLink(raw: string): string | null {
  const safe = toSafeNotificationPath(raw);
  if (safe === null) return null;
  const order = BE_ORDER_LINK.exec(safe);
  return order?.[1] ? STORE_ROUTES.account.orders.detail(order[1]) : safe;
}
