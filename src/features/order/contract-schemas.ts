import { z } from "zod";

import { installmentMilestoneSchema } from "@/lib/installments/schemas";
import { beId, isoDate } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

// ── The customer's copy of an order's sales contract (kltn-docs 14 §4.3, §5.2): BE
// CustomerSalesContractController GET /orders/me/{orderId}/contract → SalesContracts.ContractView,
// without who sent / signed / cancelled it and never with `creditWarning`. Jackson runs with
// `default-property-inclusion: non_null`, so every nullable field may be absent. ──

/** BE SalesContractStatus. The customer never sees a DRAFT (404 until it is sent). */
export const CONTRACT_STATUSES = ["DRAFT", "SENT", "SIGNED", "COMPLETED", "CANCELLED"] as const;
export const contractStatusSchema = tolerantEnum(CONTRACT_STATUSES);

const instantSchema = z.iso.datetime({ offset: true });
const amountSchema = z.number();

export const contractPartyDtoSchema = z.object({
  name: z.string(),
  taxCode: z.string().nullish(),
  address: z.string().nullish(),
  representative: z.string().nullish(),
  representativeTitle: z.string().nullish(),
});

/**
 * One delivery batch: its window, the cartons of each order line, and `value`: its goods with VAT,
 * fees not included (SO-20261123-000001: goods 25.000.000 + VAT 8 % = 27.000.000, while the order
 * is 28.620.000 with the 1.500.000 plate fee and its VAT).
 */
export const contractBatchDtoSchema = z.object({
  seq: z.number().int().positive(),
  windowStart: isoDate.nullish(),
  windowEnd: isoDate.nullish(),
  value: amountSchema,
  lines: z.array(
    z.object({
      orderLineId: beId(),
      sku: z.string().nullish(),
      cartons: z.number().int().nonnegative(),
      units: z.number().int().nonnegative(),
      // R5-3, optional.
      designName: z.string().nullish(),
      previewUrl: z.string().nullish(),
      unitsPerCarton: z.number().int().nullish(),
    }),
  ),
});

/** One installment of the payment plan (percent when it was given as one, else absent). */
export const contractInstallmentDtoSchema = z.object({
  seq: z.number().int().positive(),
  name: z.string(),
  milestone: installmentMilestoneSchema,
  percent: z.number().nullish(),
  amount: amountSchema,
  dueDays: z.number().int().nullish(),
  deliveryBatchSeq: z.number().int().nullish(),
});

export const contractDtoSchema = z.object({
  id: beId(),
  contractNumber: z.string().min(1),
  orderId: beId(),
  orderNumber: z.string().min(1),
  status: contractStatusSchema,
  seller: contractPartyDtoSchema.nullish(),
  buyer: contractPartyDtoSchema.nullish(),
  freeSampleRounds: z.number().int().nonnegative().nullish(),
  totals: z.object({
    netAmount: amountSchema,
    taxAmount: amountSchema,
    totalAmount: amountSchema,
    currency: z.string().nullish(),
  }),
  deliverySchedule: z
    .array(contractBatchDtoSchema)
    .nullish()
    .transform((batches) => batches ?? []),
  paymentPlan: z
    .array(contractInstallmentDtoSchema)
    .nullish()
    .transform((plan) => plan ?? []),
  sentAt: instantSchema.nullish(),
  signedOn: isoDate.nullish(),
  signedFileName: z.string().nullish(),
  signedAt: instantSchema.nullish(),
  completedAt: instantSchema.nullish(),
  returnWindowDays: z.number().int().nullish(),
  version: z.number().int().nonnegative(),
});

/** `{ url, expiresAt }` (BE DownloadLink): the signed file once signed, else the PDF as sent. */
export const contractDocumentDtoSchema = z.object({
  url: z.string().min(1),
  expiresAt: instantSchema.nullish(),
});

export type ContractStatus = z.infer<typeof contractStatusSchema>;
export type ContractBatch = z.infer<typeof contractBatchDtoSchema>;
export type ContractInstallment = z.infer<typeof contractInstallmentDtoSchema>;
/** One order's contract as the customer reads it. */
export type Contract = z.infer<typeof contractDtoSchema>;
export type ContractDocument = z.infer<typeof contractDocumentDtoSchema>;
