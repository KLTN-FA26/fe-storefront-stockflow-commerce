import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId, isoDate } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/**
 * Hoá đơn điện tử của khách (kltn-docs 21 §4.3, §5.2; BE `CustomerEInvoiceController`). BE chỉ trả
 * hoá đơn đã phát hành cho khách: `ISSUED` (kèm cờ `adjusted`) hoặc `REPLACED`.
 */
export const EINVOICE_TYPES = ["ORIGINAL", "ADJUSTMENT", "REPLACEMENT"] as const;
export const CUSTOMER_EINVOICE_STATUSES = ["ISSUED", "REPLACED"] as const;
export const EINVOICE_FILE_KINDS = ["PDF", "XML"] as const;
export type EInvoiceFileKind = (typeof EINVOICE_FILE_KINDS)[number];

/** BE `CustomerEInvoiceResponse`. */
export const customerEInvoiceDtoSchema = z.object({
  id: beId(),
  type: tolerantEnum(EINVOICE_TYPES),
  status: tolerantEnum(CUSTOMER_EINVOICE_STATUSES),
  adjusted: z.boolean(),
  orderId: beId(),
  orderNumber: z.string().nullish(),
  shipmentCode: z.string().nullish(),
  issueDate: isoDate,
  templateCode: z.string().nullish(),
  symbol: z.string().nullish(),
  invoiceNumber: z.number().int().nullish(),
  subtotal: z.number(),
  taxTotal: z.number(),
  grandTotal: z.number(),
  issuedAt: z.iso.datetime({ offset: true }).nullish(),
});

export const customerEInvoicePageDtoSchema = pageResponseSchema(customerEInvoiceDtoSchema);

export const fileLinkDtoSchema = z.object({
  url: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type CustomerEInvoice = z.infer<typeof customerEInvoiceDtoSchema>;
export type CustomerEInvoicePage = z.infer<typeof customerEInvoicePageDtoSchema>;
export type FileLink = z.infer<typeof fileLinkDtoSchema>;
