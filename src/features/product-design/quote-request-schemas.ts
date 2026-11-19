import { z } from "zod";

import { formatNumber } from "@/lib/format";
import { beId } from "@/lib/validation/primitives";

import { MAX_PROJECT_QUOTE_LINES, MAX_QUOTE_CARTONS, vnToday } from "./quote-request-rules";
import { designStatusSchema } from "./schemas";

// Quote requests on a design or a project (plan WF-02 Phụ lục B §A.3; BE `origin/develop`
// `design/internal/controller/dto/DesignQuoteRequestResponse`, `DesignProjectQuoteRequestResponse`).
// DTO: what the BE sends, parsed once in `api-quote-requests.ts`; the BE omits a null field, so what
// it may leave out is `.nullish()`. Fields no screen reads (customer, requester ids) are not listed.
// INPUT: what a request sends, and the dialogs' FORM schemas that turn typed text into it.

const instant = z.string().min(1);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày giao không hợp lệ.");

/** BE `QuoteRequestStatus`: OPEN until the sales staff close it as answered (or the draft is deleted). */
export const quoteRequestStatusSchema = z.enum(["OPEN", "CLOSED"]);

/** `DesignQuoteRequestResponse`: the request and the design as it is NOW (16 BR-11). */
export const designQuoteRequestDtoSchema = z.object({
  id: beId(),
  designId: beId(),
  designName: z.string(),
  designStatus: designStatusSchema,
  /** The variant SKU the design is drawn on. */
  sku: z.string().nullish(),
  /** The customer's own SKU: only once the design is APPROVED (12 BR-15). */
  customerSku: z.string().nullish(),
  /** While the design is a draft again after a return (B40). */
  returnReason: z.string().nullish(),
  cartons: z.number().int().positive(),
  desiredDeliveryDate: localDate.nullish(),
  status: quoteRequestStatusSchema,
  /** When it was first asked, not re-asked. */
  requestedAt: instant,
  closedAt: instant.nullish(),
});

/** One design of a project request; the BE sorts the lines by design id, not by input order. */
export const projectQuoteRequestLineDtoSchema = z.object({
  designId: beId(),
  designName: z.string(),
  designStatus: designStatusSchema,
  customerSku: z.string().nullish(),
  cartons: z.number().int().positive(),
});

/** `DesignProjectQuoteRequestResponse`: one quote asked over approved designs of a project (BR-21). */
export const projectQuoteRequestDtoSchema = z.object({
  id: beId(),
  projectId: beId(),
  projectName: z.string(),
  desiredDeliveryDate: localDate.nullish(),
  status: quoteRequestStatusSchema,
  requestedAt: instant,
  closedAt: instant.nullish(),
  lines: z.array(projectQuoteRequestLineDtoSchema),
});

/* ── Input ─────────────────────────────────────────────────────────────── */

const CARTONS_RANGE = `Số thùng từ 1 đến ${formatNumber(MAX_QUOTE_CARTONS)}.`;
const DATE_PAST = "Ngày giao mong muốn phải từ hôm nay trở đi.";

/** BE `@Min(1) @Max(1000000) int cartons`: a whole number of cartons, a suggestion only (14 BR-22). */
export const cartonsSchema = z
  .number({ error: "Nhập số thùng mong muốn." })
  .int("Số thùng là số nguyên.")
  .min(1, CARTONS_RANGE)
  .max(MAX_QUOTE_CARTONS, CARTONS_RANGE);

/**
 * BE `QuoteRequestRules.requireValid`: `yyyy-MM-dd`, not before today in Vietnam (today allowed).
 * "Today" is read when the value is checked, so a dialog left open past midnight checks the new day.
 */
export const desiredDeliveryDateSchema = localDate.refine((date) => date >= vnToday(), DATE_PAST);

/** `POST /designs/{id}/quote-requests`, and `quoteRequest` of a submission (A-1, A-2). */
export const quoteRequestInputSchema = z.object({
  cartons: cartonsSchema,
  desiredDeliveryDate: desiredDeliveryDateSchema.optional(),
});

/** `POST /design-projects/{id}/quote-requests` (A-6): each design named once, one shared date. */
export const projectQuoteRequestInputSchema = z.object({
  lines: z
    .array(z.object({ designId: beId(), cartons: cartonsSchema }))
    .min(1, "Chọn ít nhất một bản đã duyệt.")
    .max(MAX_PROJECT_QUOTE_LINES, `Mỗi yêu cầu có tối đa ${MAX_PROJECT_QUOTE_LINES} bản.`)
    .refine(
      (lines) => new Set(lines.map((line) => line.designId)).size === lines.length,
      "Mỗi thiết kế chỉ chọn một lần trong yêu cầu.",
    ),
  desiredDeliveryDate: desiredDeliveryDateSchema.optional(),
});

/* ── Forms: the text a customer types, turned into the input above ─────── */

/** "120" → 120; blank, a fraction or a sign is refused in words. */
const cartonsText = z
  .string()
  .trim()
  .min(1, { error: "Nhập số thùng mong muốn.", abort: true })
  .regex(/^\d+$/, "Số thùng là số nguyên dương.")
  .transform(Number)
  .pipe(cartonsSchema);

/** A date input's value: blank is no date. */
const dateText = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .pipe(desiredDeliveryDateSchema.optional());

/** The design dialog and the studio's "Gửi duyệt và yêu cầu báo giá". */
export const quoteRequestFormSchema = z.object({
  cartons: cartonsText,
  desiredDeliveryDate: dateText,
});

/**
 * The project dialog: one row per approved design (`chosen`, its cartons) and one date. Only the
 * chosen rows are checked and sent, in the order shown; the issue of a row is on that row.
 */
export const projectQuoteFormSchema = z
  .object({
    lines: z.array(z.object({ designId: beId(), chosen: z.boolean(), cartons: z.string() })),
    desiredDeliveryDate: z.string(),
  })
  .superRefine((value, ctx) => {
    const chosen = value.lines.filter((line) => line.chosen).length;
    if (chosen === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Chọn ít nhất một bản đã duyệt." });
    } else if (chosen > MAX_PROJECT_QUOTE_LINES) {
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: `Mỗi yêu cầu có tối đa ${MAX_PROJECT_QUOTE_LINES} bản.`,
      });
    }
    value.lines.forEach((line, index) => {
      if (!line.chosen) return;
      const cartons = cartonsText.safeParse(line.cartons);
      if (!cartons.success) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", index, "cartons"],
          message: cartons.error.issues[0]?.message ?? CARTONS_RANGE,
        });
      }
    });
    const date = dateText.safeParse(value.desiredDeliveryDate);
    if (!date.success) {
      ctx.addIssue({
        code: "custom",
        path: ["desiredDeliveryDate"],
        message: date.error.issues[0]?.message ?? DATE_PAST,
      });
    }
  })
  .transform((value) => {
    const date = value.desiredDeliveryDate.trim();
    return {
      lines: value.lines
        .filter((line) => line.chosen)
        .map((line) => ({ designId: line.designId, cartons: Number(line.cartons.trim()) })),
      ...(date ? { desiredDeliveryDate: date } : {}),
    };
  });
