/**
 * What the thread's messages tell about its documents, for the header and the cards: which order a contract belongs
 * to, whether the customer already sent the signed copy of a contract, which contexts the customer is shown, and how a
 * print-sample card is named. Pure, from what the thread holds: no BE change (SF-UX-24, -25, -26).
 */

import type { SampleCardPayload } from "./card-payloads";
import type { ChatContext, ChatMessage } from "./types";

/** Context kinds that are staff documents: a production order is an internal document, never a customer chip. */
const STAFF_ONLY_CONTEXTS = new Set(["PRODUCTION_ORDER"]);

/** The contexts the customer is shown (SF-UX-26). */
export const shownContexts = (contexts: readonly ChatContext[]) =>
  contexts.filter((context) => !STAFF_ONLY_CONTEXTS.has(context.kind));

/**
 * Contract id → its order id, from the thread's CONTRACT cards; when the conversation is about exactly one order, a
 * contract no card names belongs to it.
 */
export function contractOrdersOf(
  timeline: readonly ChatMessage[],
  contexts: readonly ChatContext[],
): Record<string, string> {
  const orders = contexts.filter((context) => context.kind === "ORDER");
  const onlyOrder = orders.length === 1 ? orders[0]?.refId : undefined;
  const byContract: Record<string, string> = {};
  if (onlyOrder) {
    for (const context of contexts) {
      if (context.kind === "CONTRACT") byContract[context.refId] = onlyOrder;
    }
  }
  for (const message of timeline) {
    const view = message.card?.view;
    if (view?.type === "CONTRACT") byContract[view.payload.contractId] = view.payload.orderId;
  }
  return byContract;
}

const SIGNED_COPY_TYPES = /^(application\/pdf|image\/)/;

/** A file the customer sent that can be a signed contract: a PDF or a photo/scan, not taken back. */
const isSignedCopy = (message: ChatMessage) =>
  message.senderType === "CUSTOMER" &&
  !message.deleted &&
  message.attachments.some((file) => SIGNED_COPY_TYPES.test(file.contentType ?? ""));

/**
 * CONTRACT card message id → when the customer last sent a PDF or image after it, for each contract still waiting
 * for the signature (payload SENT, card OPEN). The chat cannot tell what the file is; it tells the customer the file
 * reached Sales and that Sales still have to confirm it (SF-UX-24).
 */
export function signedCopiesOf(timeline: readonly ChatMessage[]): Record<string, string> {
  const sent: Record<string, string> = {};
  for (const card of timeline) {
    const view = card.card?.view;
    if (
      view?.type !== "CONTRACT" ||
      view.payload.status !== "SENT" ||
      card.card?.state !== "OPEN"
    ) {
      continue;
    }
    const latest = timeline
      .filter((message) => message.seq > card.seq && isSignedCopy(message))
      .at(-1);
    if (latest) sent[card.id] = latest.sentAt;
  }
  return sent;
}

const nameOf = (sku: unknown): string | null => {
  if (typeof sku === "string") return sku.trim() || null;
  if (sku && typeof sku === "object") {
    const fields = sku as Record<string, unknown>;
    for (const key of ["designName", "productName", "name", "customerSku", "sku"]) {
      const value = fields[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
};

/**
 * The print sample as the customer knows it: the design or product, else the goods' SKUs — never the production
 * order's code, an internal document (SF-UX-25). `named` tells whether it is a name rather than codes.
 */
export function sampleCardTitle(payload: SampleCardPayload): { title: string; named: boolean } {
  const name = payload.designName?.trim() || payload.productName?.trim();
  const round = payload.roundNo ? ` · lần ${payload.roundNo}` : "";
  if (name) return { title: `${name}${round}`, named: true };
  const skus = [...new Set(payload.skus.map(nameOf).filter((sku): sku is string => sku !== null))];
  return { title: `${skus.length > 0 ? skus.join(", ") : "Mẫu in"}${round}`, named: false };
}
