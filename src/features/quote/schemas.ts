import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { PURCHASABILITY_VALUES } from "@/lib/domain/quote-purchasability";
import { beId, isoDate } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

// BE QuoteController takes `@PathVariable UUID quoteId`: anything else answers 400, so an id from
// the URL is checked before it is sent.
export const quoteIdSchema = beId();
export const isValidQuoteId = (quoteId: string) => quoteIdSchema.safeParse(quoteId).success;

/**
 * BE order QuoteStatus (kltn-docs 14 §5.1). The BE reports a SENT quote past its validity as
 * EXPIRED on every read (QuoteService.view / list), before the sweep writes it down.
 */
export const QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "EXPIRED",
  "CANCELLED",
  "CONVERTED",
] as const;
export const quoteStatusSchema = tolerantEnum(QUOTE_STATUSES);

// ── DTOs — mirror BE QuoteResponse / QuoteRowResponse (plan Phụ lục A.1). Jackson runs with
// `default-property-inclusion: non_null`, so every nullable field may be absent, not just null.
// BigDecimal money and rates arrive as JSON numbers. ──

const instantSchema = z.iso.datetime({ offset: true });
const amountSchema = z.number();

/** A price break: from `minQuantity` cartons up, `unitPrice` VND per piece. */
export const quoteTierDtoSchema = z.object({
  minQuantity: z.number().int().positive(),
  unitPrice: amountSchema,
});

/**
 * One line (QuoteResponse.Line): cartons of the customer's own SKU priced per piece (14 BR-08).
 * `moq` is where the lowest tier starts; `taxRate` is a percentage (8 = 8 %, BE Vat.rate).
 * A legacy line (measure UNIT, before the 4B-2 rescope) has no cartons and is read only.
 */
export const quoteLineDtoSchema = z.object({
  id: beId(),
  lineNo: z.number().int().positive(),
  measure: tolerantEnum(["CARTON", "UNIT"]),
  sku: z.string().min(1),
  cartons: z.number().int().nullish(),
  unitsPerCarton: z.number().int().nullish(),
  units: z.number().int().nonnegative(),
  designSnapshotId: beId().nullish(),
  printSpec: z.string().nullish(),
  // R5-3, optional: the design's name and a short-lived preview URL (null when it has none).
  designName: z.string().nullish(),
  previewUrl: z.string().nullish(),
  priced: z.boolean().catch(false),
  moq: z.number().int().nullish(),
  tiers: z
    .array(quoteTierDtoSchema)
    .nullish()
    .transform((tiers) => tiers ?? []),
  proposedUnitPrice: amountSchema.nullish(),
  proposedLineTotal: amountSchema.nullish(),
  acceptedCartons: z.number().int().nullish(),
  acceptedUnits: z.number().int().nullish(),
  acceptedUnitPrice: amountSchema.nullish(),
  acceptedLineTotal: amountSchema.nullish(),
  taxClass: z.string().nullish(),
  taxRate: z.number().nullish(),
  proposedTax: amountSchema.nullish(),
  acceptedTax: amountSchema.nullish(),
  // WF-02 FE-1: whether the SKU may still be bought; null on a legacy line (BE Purchasability).
  purchasability: tolerantEnum(PURCHASABILITY_VALUES).nullish(),
});

/** A fee line (QuoteResponse.Fee, 14 BR-17/BR-20): no cartons, never counted towards MOQ or tiers. */
export const QUOTE_FEE_KINDS = ["PLATE_FEE", "SHIPPING_FEE"] as const;
export const quoteFeeDtoSchema = z.object({
  id: beId(),
  kind: tolerantEnum(QUOTE_FEE_KINDS),
  sku: z.string().nullish(),
  amount: amountSchema.nullish(),
  taxClass: z.string().nullish(),
  taxRate: z.number().nullish(),
  tax: amountSchema.nullish(),
});

/** Goods, fees, VAT and the total with it; a part not known yet is absent, and so is the total. */
export const quoteTotalsDtoSchema = z.object({
  subtotal: amountSchema.nullish(),
  fees: amountSchema.nullish(),
  tax: amountSchema.nullish(),
  total: amountSchema.nullish(),
});

/** The order made from the quote. The customer only gets it once the order's contract is sent. */
export const quoteConvertedOrderDtoSchema = z.object({
  orderId: beId(),
  orderNumber: z.string().min(1),
  status: z.string(),
  total: amountSchema,
});

export const quoteTransitionDtoSchema = z.object({
  revision: z.number().int(),
  fromStatus: quoteStatusSchema.nullish(),
  toStatus: quoteStatusSchema,
  reason: z.string().nullish(),
  changedAt: instantSchema,
  changedBy: z.string().nullish(),
});

/** GET /quotes/{id} (BE QuoteResponse). */
export const quoteDtoSchema = z.object({
  id: beId(),
  quoteNumber: z.string().min(1),
  customerId: beId(),
  status: quoteStatusSchema,
  revision: z.number().int().positive(),
  validUntil: instantSchema,
  terms: z.string().nullish(),
  requestedDeliveryDate: isoDate.nullish(),
  legacy: z.boolean().catch(false),
  lines: z.array(quoteLineDtoSchema),
  fees: z
    .array(quoteFeeDtoSchema)
    .nullish()
    .transform((fees) => fees ?? []),
  priced: z.boolean().catch(false),
  proposed: quoteTotalsDtoSchema.nullish(),
  accepted: quoteTotalsDtoSchema.nullish(),
  proposedTotal: amountSchema.nullish(),
  acceptedTotal: amountSchema.nullish(),
  sentAt: instantSchema.nullish(),
  respondedAt: instantSchema.nullish(),
  customerFeedback: z.string().nullish(),
  cancellationReason: z.string().nullish(),
  convertedOrder: quoteConvertedOrderDtoSchema.nullish(),
  convertedAt: instantSchema.nullish(),
  history: z
    .array(quoteTransitionDtoSchema)
    .nullish()
    .transform((history) => history ?? []),
  createdAt: instantSchema,
  version: z.number().int().nonnegative(),
});

/**
 * One row of GET /quotes (BE QuoteRowResponse). R5-2 adds, optionally, the total with VAT (accepted
 * once accepted, else proposed; absent while not priceable), the line count and line 1's design
 * name or SKU — an older BE sends none of them — and the number of the order made from it.
 */
export const quoteRowDtoSchema = z.object({
  id: beId(),
  quoteNumber: z.string().min(1),
  customerId: beId(),
  status: quoteStatusSchema,
  revision: z.number().int().positive(),
  validUntil: instantSchema,
  sentAt: instantSchema.nullish(),
  convertedOrderId: beId().nullish(),
  createdAt: instantSchema,
  version: z.number().int().nonnegative(),
  total: amountSchema.nullish(),
  lineCount: z.number().int().nonnegative().nullish(),
  firstItemName: z.string().nullish(),
  // The number of the order `convertedOrderId` names; absent on the customer's copy while that order
  // is still a DRAFT (its contract not yet sent, 17 §5.2).
  convertedOrderNumber: z.string().min(1).nullish(),
  // BE PR #497, optional until it ships: that order's status now (an OrderStatus name, parsed
  // tolerantly); null exactly when convertedOrderNumber is.
  convertedOrderStatus: z.string().min(1).nullish(),
});

export const quotePageDtoSchema = pageResponseSchema(quoteRowDtoSchema);

// ── Input — POST /quotes/{id}/acceptance and /change-request (BE QuoteRequests) ──

export const QUOTE_FEEDBACK_MAX = 2000;
/** BE QuoteRequests.Acceptance: at most 50 lines. */
export const QUOTE_LINES_MAX = 50;

/** `{ version, lines: [{ lineId, cartons ≥ 1 }] }`; a line left out keeps its proposed cartons. */
export const quoteAcceptanceInputSchema = z.object({
  quoteId: quoteIdSchema,
  version: z.number().int().nonnegative(),
  lines: z
    .array(z.object({ lineId: beId(), cartons: z.number().int().min(1) }))
    .max(QUOTE_LINES_MAX),
});

/** `{ version, feedback }`: feedback 1–2000 characters once trimmed (BE Quote.requestChanges). */
export const quoteChangeRequestInputSchema = z.object({
  quoteId: quoteIdSchema,
  version: z.number().int().nonnegative(),
  feedback: z.string().trim().min(1).max(QUOTE_FEEDBACK_MAX),
});

/** The change-request dialog's form. */
export const quoteFeedbackFormSchema = z.object({
  feedback: z
    .string()
    .trim()
    .min(1, "Hãy ghi rõ bạn muốn sửa gì trong báo giá.")
    .max(QUOTE_FEEDBACK_MAX, `Tối đa ${QUOTE_FEEDBACK_MAX} ký tự.`),
});

/** What the acceptance form needs to know of a line to check it before the BE does. */
export interface AcceptableLine {
  lineId: string;
  lineNo: number;
  sku: string;
  moq: number | null;
}

/**
 * The acceptance form (14 §4.1 step 4, BR-07): whole cartons, at least 1, and — per SKU, summed
 * over every line of it, as the BE picks tiers and checks the MOQ (Quote.accept) — not below the
 * line's MOQ. Built per quote because the MOQ comes with the data. The BE checks again.
 */
export function quoteAcceptanceFormSchema(lines: readonly AcceptableLine[]) {
  return z
    .object({
      lines: z.array(
        z.object({
          lineId: beId(),
          cartons: z
            .number({ error: "Nhập số thùng." })
            .int("Số thùng phải là số nguyên.")
            .min(1, "Ít nhất 1 thùng.")
            .max(1_000_000, "Số thùng quá lớn."),
        }),
      ),
    })
    .superRefine((form, ctx) => {
      const bySku = new Map<string, number>();
      form.lines.forEach((entry, index) => {
        const sku = lines[index]?.sku;
        if (sku) bySku.set(sku, (bySku.get(sku) ?? 0) + (entry.cartons || 0));
      });
      form.lines.forEach((entry, index) => {
        const line = lines[index];
        if (!line || line.moq == null) return;
        const total = bySku.get(line.sku) ?? entry.cartons;
        if (total < line.moq) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", index, "cartons"],
            message: `Dòng ${line.lineNo}: tối thiểu ${line.moq} thùng (MOQ).`,
          });
        }
      });
    });
}
