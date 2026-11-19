/**
 * Card payloads of the chat (plan Phụ lục B §B.7, BE `DocumentCards.java`). A payload is stored as
 * JSONB and shaped by the card's kind; keys built from a record are omitted when null, so every
 * optional key is `.nullish()`. A known kind whose payload does not parse, or a kind the FE does not
 * know, becomes `UNKNOWN`: the card then shows its `body` fallback text instead of breaking.
 */

import { z } from "zod";

const id = z.string().min(1);
const text = z.string().nullish();
const count = z.number().int().nullish();
const money = z.number().nullish();

/** B.7.1 QUOTE_REQUEST, design scope (`designRequestPayload`). */
export const designQuoteRequestPayloadSchema = z.object({
  scope: z.literal("DESIGN"),
  requestId: id,
  designId: id,
  designName: z.string(),
  designStatus: z.string(),
  sku: text,
  customerSku: text,
  returnReason: text,
  cartons: count,
  desiredDeliveryDate: text,
  requestStatus: text,
  requestedAt: text,
  quoteId: text,
  quoteNumber: text,
});

/** B.7.2 QUOTE_REQUEST, project scope: the request state is `status`, not `requestStatus`. */
export const projectQuoteRequestPayloadSchema = z.object({
  scope: z.literal("PROJECT"),
  requestId: id,
  projectId: id,
  projectName: z.string(),
  status: text,
  desiredDeliveryDate: text,
  requestedAt: text,
  lines: z
    .array(
      z.object({
        designId: id,
        designName: z.string(),
        designStatus: z.string(),
        customerSku: text,
        cartons: count,
      }),
    )
    .nullish()
    .transform((lines) => lines ?? []),
  quoteId: text,
  quoteNumber: text,
});

/** B.7.3 QUOTE (`QuoteCards.Card` + quoteId + currency). `lines[].id` keys ACCEPT's cartons. */
export const quoteCardPayloadSchema = z.object({
  quoteId: id,
  number: z.string(),
  status: z.string(),
  revision: count,
  validUntil: text,
  requestedDeliveryDate: text,
  lines: z.array(
    z.object({
      id,
      lineNo: z.number().int(),
      sku: z.string(),
      cartons: count,
      unitsPerCarton: count,
      units: count,
      unitPrice: money,
      lineTotal: money,
      acceptedCartons: count,
    }),
  ),
  proposedTotal: money,
  acceptedTotal: money,
  convertedOrderId: text,
  convertedOrderNumber: text,
  sentAt: text,
  version: z.number().int(),
  currency: text,
});

/** B.7.4 CONTRACT (`ContractCards.Card` + contractId + documentPath). */
export const contractCardPayloadSchema = z.object({
  contractId: id,
  number: z.string(),
  orderId: id,
  orderNumber: text,
  status: z.string(),
  totalAmount: money,
  currency: text,
  freeSampleRounds: count,
  paymentPlan: z
    .array(
      z.object({
        seq: z.number().int(),
        name: z.string(),
        milestone: z.string(),
        amount: z.number(),
        percent: money,
        dueDays: count,
        deliveryBatchSeq: count,
      }),
    )
    .nullish()
    .transform((plan) => plan ?? []),
  sentAt: text,
  signedOn: text,
  cancelledAt: text,
  version: count,
  documentPath: text,
});

/** B.7.5 PAYMENT_INFO / PAYMENT_REMINDER (`transferPayload`). `amount` is what is still owed. */
export const transferCardPayloadSchema = z.object({
  installmentId: id,
  contractNumber: text,
  orderId: text,
  orderNumber: text,
  seq: count,
  name: text,
  amount: z.number(),
  installmentAmount: money,
  currency: text,
  dueDate: text,
  overdue: z.boolean().nullish(),
  status: text,
  transferContent: z.string(),
  reminder: z.boolean().nullish(),
  bank: z
    .object({
      bankName: z.string(),
      bankBin: text,
      accountNumber: z.string(),
      accountName: z.string(),
    })
    .nullish(),
  vietQr: text,
});

/** B.7.6 CSAT_SURVEY: `{conversationId, scale: 5, score?}`. */
export const csatCardPayloadSchema = z.object({
  scale: count,
  score: count,
});

export type DesignQuoteRequestPayload = z.infer<typeof designQuoteRequestPayloadSchema>;
export type ProjectQuoteRequestPayload = z.infer<typeof projectQuoteRequestPayloadSchema>;
export type QuoteCardPayload = z.infer<typeof quoteCardPayloadSchema>;
export type QuoteCardLine = QuoteCardPayload["lines"][number];
export type ContractCardPayload = z.infer<typeof contractCardPayloadSchema>;
export type TransferCardPayload = z.infer<typeof transferCardPayloadSchema>;
export type CsatCardPayload = z.infer<typeof csatCardPayloadSchema>;

export type ChatCardView =
  | { type: "DESIGN_QUOTE_REQUEST"; payload: DesignQuoteRequestPayload }
  | { type: "PROJECT_QUOTE_REQUEST"; payload: ProjectQuoteRequestPayload }
  | { type: "QUOTE"; payload: QuoteCardPayload }
  | { type: "CONTRACT"; payload: ContractCardPayload }
  | { type: "TRANSFER"; payload: TransferCardPayload; reminder: boolean }
  | { type: "CSAT"; payload: CsatCardPayload }
  | { type: "UNKNOWN" };

const UNKNOWN: ChatCardView = { type: "UNKNOWN" };

/** The typed view of a card's payload; `UNKNOWN` for a kind or payload the FE cannot read. */
export function cardViewOf(kind: string, payload: unknown): ChatCardView {
  if (payload === null || payload === undefined) return UNKNOWN;
  switch (kind) {
    case "QUOTE_REQUEST": {
      const design = designQuoteRequestPayloadSchema.safeParse(payload);
      if (design.success) return { type: "DESIGN_QUOTE_REQUEST", payload: design.data };
      const project = projectQuoteRequestPayloadSchema.safeParse(payload);
      return project.success ? { type: "PROJECT_QUOTE_REQUEST", payload: project.data } : UNKNOWN;
    }
    case "QUOTE": {
      const parsed = quoteCardPayloadSchema.safeParse(payload);
      return parsed.success ? { type: "QUOTE", payload: parsed.data } : UNKNOWN;
    }
    case "CONTRACT": {
      const parsed = contractCardPayloadSchema.safeParse(payload);
      return parsed.success ? { type: "CONTRACT", payload: parsed.data } : UNKNOWN;
    }
    case "PAYMENT_INFO":
    case "PAYMENT_REMINDER": {
      const parsed = transferCardPayloadSchema.safeParse(payload);
      return parsed.success
        ? {
            type: "TRANSFER",
            payload: parsed.data,
            reminder: kind === "PAYMENT_REMINDER" || parsed.data.reminder === true,
          }
        : UNKNOWN;
    }
    case "CSAT_SURVEY": {
      const parsed = csatCardPayloadSchema.safeParse(payload);
      return parsed.success ? { type: "CSAT", payload: parsed.data } : UNKNOWN;
    }
    default:
      return UNKNOWN;
  }
}
