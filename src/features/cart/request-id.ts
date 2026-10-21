/**
 * Idempotency key for POST /orders. The BE returns the ORIGINAL order for a repeated requestId
 * whatever the new request says (OrderServiceImpl.place), so the key must change whenever the
 * order's content does, or an edited cart would silently resolve to an older order — and it must
 * survive a reload, or a retry after a timeout (the order may well exist already) would place the
 * order twice. So it is kept in sessionStorage against a fingerprint of the content: the same
 * content gets the same key until the order is placed, a different content gets a new one.
 * One slot is enough: only the order being placed matters.
 *
 * The same slot remembers the payment term the customer picked (`term`): it is part of the order's
 * content, so it must survive the same reload, or the key computed after it would differ from the
 * one the (possibly already placed) order was sent with. It lives and dies with the request id.
 */
const SLOT = "stockflow:storefront:checkout-request";

interface Slot {
  key: string;
  id: string;
  /** The payment term picked for the order in progress; absent until the customer picks one. */
  term?: string;
}

function read(): Slot | undefined {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(SLOT) ?? "null");
    const slot = raw as Partial<Slot> | null;
    return slot && typeof slot.key === "string" && typeof slot.id === "string"
      ? {
          key: slot.key,
          id: slot.id,
          ...(typeof slot.term === "string" ? { term: slot.term } : {}),
        }
      : undefined;
  } catch {
    return undefined; // storage blocked or damaged: fall back to a fresh key
  }
}

/** The key for this content: the stored one when the content is unchanged, else a new one. */
export function requestIdFor(contentKey: string): string {
  const stored = read();
  if (stored?.key === contentKey) return stored.id;
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(
      SLOT,
      JSON.stringify({
        key: contentKey,
        id,
        ...(stored?.term ? { term: stored.term } : {}),
      } satisfies Slot),
    );
  } catch {
    // Without storage the key lasts only for this call; a reload then risks a second order.
  }
  return id;
}

/** The payment term picked for the order in progress, as left by {@link rememberPickedTerm}. */
export const readPickedTerm = (): string | undefined => read()?.term;

/** Keep the customer's pick across a reload (see the note on top); the request id is not touched. */
export function rememberPickedTerm(term: string): void {
  const stored = read();
  try {
    sessionStorage.setItem(
      SLOT,
      JSON.stringify({ key: stored?.key ?? "", id: stored?.id ?? "", term } satisfies Slot),
    );
  } catch {
    // Without storage the pick lasts until a reload; the key then follows the default term.
  }
}

/** The order exists now: the next one with the same content is a new order and needs a new key. */
export function forgetRequestId(): void {
  try {
    sessionStorage.removeItem(SLOT);
  } catch {
    // nothing to forget
  }
}
