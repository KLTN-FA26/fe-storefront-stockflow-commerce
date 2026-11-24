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

/** Một hoá đơn khác của khách mà hoá đơn này nhắc tới (BE `CustomerEInvoiceReference`). */
export const einvoiceReferenceDtoSchema = z.object({ id: beId(), code: z.string() });

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
  /** Trên hoá đơn thay thế: hoá đơn nó thay (TT 91 Điều 10). BE bỏ trường khi null. */
  replaces: einvoiceReferenceDtoSchema.nullish(),
  /**
   * Trên hoá đơn "Đã bị thay thế": hoá đơn đã phát hành thay nó — có thể chính nó cũng đã bị thay,
   * nên đi từng mắt xích. Null tới khi hoá đơn thay thế được phát hành.
   */
  replacedBy: einvoiceReferenceDtoSchema.nullish(),
});

export const customerEInvoicePageDtoSchema = pageResponseSchema(customerEInvoiceDtoSchema);

/**
 * Trạng thái của một thông báo sai sót (BE `CustomerEInvoiceErrorNoticeResponse.status`): DRAFT —
 * người bán đã ghi nhận, chưa qua hệ thống tới cơ quan thuế; SENT; ACCEPTED; REJECTED.
 */
export const ERROR_NOTICE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED"] as const;

/**
 * Thông báo hoá đơn ghi sai tên / địa chỉ người mua, mã số thuế đúng (Mẫu 04/SS-HĐĐT, TT 91/2026
 * Điều 10 khoản 1a): hoá đơn giữ nguyên giá trị, đây là thông tin đúng (BE
 * `CustomerEInvoiceErrorNoticeResponse`). Không có ai ghi nhận hay mã của nhà cung cấp.
 */
export const customerEInvoiceErrorNoticeDtoSchema = z.object({
  id: beId(),
  einvoiceId: beId().nullish(),
  formCode: z.string().nullish(),
  /** Tên mẫu như luật in (`04/SS-HĐĐT`), để hiển thị. */
  formName: z.string().nullish(),
  reason: z.string().nullish(),
  /** Tên hoá đơn đáng lẽ phải ghi; null khi tên đúng. */
  correctBuyerName: z.string().nullish(),
  /** Địa chỉ hoá đơn đáng lẽ phải ghi; null khi địa chỉ đúng. */
  correctBuyerAddress: z.string().nullish(),
  status: tolerantEnum(ERROR_NOTICE_STATUSES),
  recordedAt: z.iso.datetime({ offset: true }).nullish(),
  respondedAt: z.iso.datetime({ offset: true }).nullish(),
});

export const customerEInvoiceErrorNoticesDtoSchema = z.array(customerEInvoiceErrorNoticeDtoSchema);

export const fileLinkDtoSchema = z.object({
  url: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type CustomerEInvoice = z.infer<typeof customerEInvoiceDtoSchema>;
export type EInvoiceReference = z.infer<typeof einvoiceReferenceDtoSchema>;
export type CustomerEInvoicePage = z.infer<typeof customerEInvoicePageDtoSchema>;
export type CustomerEInvoiceErrorNotice = z.infer<typeof customerEInvoiceErrorNoticeDtoSchema>;
export type FileLink = z.infer<typeof fileLinkDtoSchema>;
