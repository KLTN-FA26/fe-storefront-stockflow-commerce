import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId, currencySchema, isoDate } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

// ── Contract installments (kltn-docs 15 §4.1, §5.1) — BE payment InstallmentController /me. Jackson
// runs with `default-property-inclusion: non_null`, so every nullable field may be absent. ──

/**
 * When an installment falls due (15 §4.1 step 2). CANCELLATION_FEE and FAILED_TRIP_FEE are fees the
 * customer pays like an installment (15 §4.6 step 18; a refused or misaddressed delivery's trip).
 */
export const INSTALLMENT_MILESTONES = [
  "ON_SIGNING",
  "BEFORE_DELIVERY",
  "AFTER_DELIVERY",
  "CANCELLATION_FEE",
  "FAILED_TRIP_FEE",
] as const;
export const installmentMilestoneSchema = tolerantEnum(INSTALLMENT_MILESTONES);

/**
 * BE InstallmentStatus (15 §5.1). Overdue is not a status since the WF-05 fix plan §8: it is the
 * `overdue` flag the BE works out from the due day when read.
 */
export const INSTALLMENT_STATUSES = [
  "NOT_DUE",
  "DUE",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
] as const;
export const installmentStatusSchema = tolerantEnum(INSTALLMENT_STATUSES);

const instantSchema = z.iso.datetime({ offset: true });
const amountSchema = z.number().nonnegative();

/** A receipt that paid the installment; on the detail only, and for a customer the live ones only. */
export const installmentReceiptDtoSchema = z.object({
  receiptId: beId(),
  reference: z.string(),
  receivedOn: isoDate,
  amount: amountSchema,
  status: z.string(),
  recordedAt: instantSchema,
});

/** BE InstallmentResponse. */
export const installmentDtoSchema = z.object({
  installmentId: beId(),
  contractId: beId(),
  contractNumber: z.string().min(1),
  orderId: beId(),
  orderNumber: z.string().min(1),
  seq: z.number().int().positive(),
  name: z.string(),
  milestone: installmentMilestoneSchema,
  // The delivery batch it is tied to (17 §4.5); absent when none.
  deliveryBatchSeq: z.number().int().positive().nullish(),
  amount: amountSchema,
  paidAmount: amountSchema,
  // What closing the order's undelivered rest took off it (15 §4.6 step 19).
  reducedAmount: amountSchema.nullish(),
  outstanding: amountSchema,
  currency: currencySchema,
  // When its milestone came; absent while NOT_DUE.
  reachedAt: instantSchema.nullish(),
  // Absent before its milestone and for an installment paid before delivery.
  dueDate: isoDate.nullish(),
  status: installmentStatusSchema,
  overdue: z.boolean(),
  paidAt: instantSchema.nullish(),
  cancelledAt: instantSchema.nullish(),
  // Contract number + installment (15 §4.2 step 5).
  transferReference: z.string().nullish(),
  receipts: z.array(installmentReceiptDtoSchema).nullish(),
});

/** BE OrderInstallmentsResponse (15 §5.2): the payment status is worked out from the installments. */
export const ORDER_PAYMENT_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID"] as const;

export const orderInstallmentsDtoSchema = z.object({
  orderId: beId(),
  orderNumber: z.string().min(1),
  contractNumber: z.string().nullish(),
  // Absent when every installment is cancelled.
  paymentStatus: tolerantEnum(ORDER_PAYMENT_STATUSES).nullish(),
  total: amountSchema,
  paid: amountSchema,
  outstanding: amountSchema,
  // Every installment due on signing is paid (15 BR-07).
  onSigningPaid: z.boolean(),
  // What must be paid before goods may leave (15 BR-07, BR-08).
  dueBeforeHandover: amountSchema.nullish(),
  currency: currencySchema,
  installments: z.array(installmentDtoSchema),
});

/** BE InstallmentTransferResponse (15 §4.2 step 5): how to pay one installment by bank transfer. */
export const installmentTransferDtoSchema = z.object({
  installmentId: beId(),
  contractNumber: z.string().min(1),
  orderNumber: z.string().min(1),
  seq: z.number().int().positive(),
  name: z.string(),
  bankName: z.string(),
  accountNumber: z.string(),
  accountName: z.string(),
  amountDue: amountSchema,
  currency: currencySchema,
  // What to write as the transfer content.
  reference: z.string().min(1),
  dueDate: isoDate.nullish(),
});

export const installmentPageDtoSchema = pageResponseSchema(installmentDtoSchema);

export type Installment = z.infer<typeof installmentDtoSchema>;
export type InstallmentMilestone = Installment["milestone"];
export type InstallmentStatus = Installment["status"];
export type OrderInstallments = z.infer<typeof orderInstallmentsDtoSchema>;
export type InstallmentTransfer = z.infer<typeof installmentTransferDtoSchema>;
export type InstallmentPage = z.infer<typeof installmentPageDtoSchema>;
