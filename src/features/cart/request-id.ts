/**
 * Idempotency key for POST /orders. The BE returns the ORIGINAL order for a repeated requestId
 * whatever the new request says (OrderServiceImpl.place), so the key must change whenever the
 * order's content does, or an edited cart would silently resolve to an older order — and it must
 * survive a reload, or a retry after a timeout (the order may well exist already) would place the
 * order twice. So it is kept in sessionStorage against a fingerprint of the content: the same
 * content gets the same key until the order is placed, a different content gets a new one.
 * One slot is enough: only the order being placed matters.
 */
const SLOT = "stockflow:storefront:checkout-request";

interface Slot {
  key: string;
  id: string;
}

function read(): Slot | undefined {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(SLOT) ?? "null");
    const slot = raw as Partial<Slot> | null;
    return slot && typeof slot.key === "string" && typeof slot.id === "string"
      ? { key: slot.key, id: slot.id }
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
    sessionStorage.setItem(SLOT, JSON.stringify({ key: contentKey, id } satisfies Slot));
  } catch {
    // Without storage the key lasts only for this call; a reload then risks a second order.
  }
  return id;
}

/** The order exists now: the next one with the same content is a new order and needs a new key. */
export function forgetRequestId(): void {
  try {
    sessionStorage.removeItem(SLOT);
  } catch {
    // nothing to forget
  }
}
