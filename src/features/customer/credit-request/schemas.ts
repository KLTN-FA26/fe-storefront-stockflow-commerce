import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";

/**
 * A credit request as the portal reads it (BE `CreditRequestResponse`, PR #490; kltn-docs 15 §4.3, 18 §4.1 step 5).
 * The BE leaves out Sales' opinion, who in the back office acted and the review for a customer; the accountant's
 * `decisionNote` - the reason of a rejection - is the customer's to see.
 */
export const CREDIT_REQUEST_STATUSES = [
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const creditRequestFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  contentType: z.string().nullish(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
});

export const creditRequestSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  /** `PORTAL` (the customer asked) | `SALES` (Sales asked for them). */
  source: z.string(),
  status: z.union([
    z.enum(CREDIT_REQUEST_STATUSES),
    z.string().transform((): "UNKNOWN" => "UNKNOWN"),
  ]),
  requestedLimit: z.number(),
  requestedTermDays: z.number().int(),
  currency: z.enum(["VND", "USD", "CNY"]).catch("VND"),
  reason: z.string().nullish(),
  submittedAt: z.string(),
  approvedLimit: z.number().nullish(),
  approvedTermDays: z.number().int().nullish(),
  decidedAt: z.string().nullish(),
  decisionNote: z.string().nullish(),
  version: z.number().int(),
  files: z.array(creditRequestFileSchema).nullish(),
});

export const creditRequestPageSchema = pageResponseSchema(creditRequestSchema);
export const downloadLinkSchema = z.object({ url: z.string() });

/** 15 §4.3 step 9: the limit asked (> 0), the days to pay after delivery (0–365), why — optional, ≤ 1000. */
export const creditRequestFormSchema = z.object({
  requestedLimit: z.coerce
    .number({ message: "Nhập hạn mức muốn xin" })
    .int("Hạn mức là số nguyên")
    .positive("Hạn mức phải lớn hơn 0"),
  requestedTermDays: z.coerce
    .number({ message: "Nhập số ngày" })
    .int("Số ngày là số nguyên")
    .min(0, "Từ 0 ngày")
    .max(365, "Tối đa 365 ngày"),
  reason: z.string().trim().max(1000, "Tối đa 1000 ký tự").optional(),
});

export type CreditRequest = z.infer<typeof creditRequestSchema>;
export type CreditRequestStatus = CreditRequest["status"];
export type CreditRequestFile = z.infer<typeof creditRequestFileSchema>;
export type CreditRequestFormValues = z.input<typeof creditRequestFormSchema>;
export type CreditRequestInput = z.output<typeof creditRequestFormSchema>;

/** PDF, Word, Excel, JPEG, PNG; ≤ 25 MB each; at most 10 (BE `CreditRequestFiles`). */
export const CREDIT_REQUEST_FILE_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxFiles: 10,
  accept: ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png",
} as const;
