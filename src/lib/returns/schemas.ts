import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";
import { beId, currencySchema } from "@/lib/validation/primitives";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

/**
 * Trả hàng (RMA) của khách — BE `ReturnRequestController` (kltn-docs 17 §4.10, team plan 4D-3).
 * Vòng đời: BE `ReturnStatus`. `INSPECTED` chỉ còn trong lịch sử cũ (không bước QC nào nữa).
 */
export const RETURN_STATUSES = [
  "REQUESTED",
  "AWAITING_RETURN",
  "RECEIVED",
  "INSPECTED",
  "SETTLEMENT_PENDING",
  "RESOLVED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export const returnStatusSchema = tolerantEnum(RETURN_STATUSES);

/** BE `ReturnReason`. */
export const RETURN_REASONS = [
  "PRINT_DEFECT",
  "DESIGN_MISMATCH",
  "DAMAGED_IN_TRANSIT",
  "WRONG_ITEM",
  "SHORT_DELIVERY",
  "CHANGED_MIND",
  "OTHER",
] as const;
export const returnReasonSchema = tolerantEnum(RETURN_REASONS);

/**
 * Lý do khách được chọn khi mở yêu cầu. Bỏ `SHORT_DELIVERY` (giao thiếu không có hàng để gửi lại —
 * BE `RETURN_REASON_NOT_ACCEPTED`, sửa ở kết quả giao) và `CHANGED_MIND` (chính sách mặc định không
 * nhận đổi ý — `ReturnPolicy.changeOfMindForStockItems` = false, SCRUM-243).
 */
export const CUSTOMER_RETURN_REASONS = [
  "PRINT_DEFECT",
  "DESIGN_MISMATCH",
  "DAMAGED_IN_TRANSIT",
  "WRONG_ITEM",
  "OTHER",
] as const;
export type CustomerReturnReason = (typeof CUSTOMER_RETURN_REASONS)[number];

/** BR-RMA-002 (17 BR-08): hàng in theo thiết kế của khách chỉ trả khi có lỗi được gọi tên. */
export const NAMED_FAULT_REASONS: readonly CustomerReturnReason[] = [
  "PRINT_DEFECT",
  "DESIGN_MISMATCH",
  "DAMAGED_IN_TRANSIT",
  "WRONG_ITEM",
];

/**
 * Yêu cầu đã xong (`RESOLVED`) kết thúc thế nào (BE `CustomerReturnResponse.outcome`, WF-05 Q-4):
 * hoàn tiền; Kế toán duyệt không hoàn theo chính sách (có lý do); hoặc không có gì để hoàn. Null khi
 * yêu cầu chưa xong — và BE cũ không gửi trường này, khi đó FE đọc theo số tiền (`refundOutcome`).
 */
export const RETURN_OUTCOMES = ["REFUNDED", "REFUSED", "NOTHING_TO_REFUND"] as const;
export const returnOutcomeSchema = tolerantEnum(RETURN_OUTCOMES);

/**
 * Lý do không hoàn tiền, trong danh sách cố định khách được xem (BE `ReturnRefusalReason`, WF-05
 * Q-4 — lời từ chối là văn bản trả lời khiếu nại, Luật Thương mại Điều 318).
 */
export const RETURN_REFUSAL_REASONS = [
  "CUSTOMER_DAMAGE",
  "NOT_DEFECTIVE",
  "OUT_OF_POLICY",
  "OTHER",
] as const;
export const returnRefusalReasonSchema = tolerantEnum(RETURN_REFUSAL_REASONS);

/** BE `ReturnRequestRowResponse` — một dòng trong danh sách của khách. */
export const returnRowDtoSchema = z.object({
  id: beId(),
  rmaNumber: z.string(),
  orderId: beId(),
  orderNumber: z.string().nullish(),
  /** Lần giao hàng trả về đã đến (WF-05 TH-1); null với đơn giao một lần không ghi lần giao. */
  shipmentId: beId().nullish(),
  status: returnStatusSchema,
  reasonCode: returnReasonSchema,
  requestedResolution: z.string().nullish(),
  requestedAt: z.string(),
  returnDeadline: z.string().nullish(),
  settlementAmount: z.number().nullish(),
  refundedAmount: z.number().nullish(),
  offsetAmount: z.number().nullish(),
  /** Như trên chi tiết; dòng danh sách có thể không có — khi đó đọc theo số tiền. */
  outcome: returnOutcomeSchema.nullish(),
  currency: currencySchema.nullish().catch(null),
  closedAt: z.string().nullish(),
  version: z.number(),
});
export const returnPageDtoSchema = pageResponseSchema(returnRowDtoSchema);

/** BE `CustomerReturnResponse.Line`: yêu cầu → duyệt → đã nhận → hoàn (đơn vị là cái). */
export const customerReturnLineDtoSchema = z.object({
  id: beId(),
  orderLineId: beId(),
  sku: z.string(),
  requestedQuantity: z.number().int(),
  approvedQuantity: z.number().int().nullish(),
  receivedQuantity: z.number().int().nullish(),
  refundQuantity: z.number().int(),
  refundAmount: z.number().nullish(),
});

export const customerReturnEvidenceDtoSchema = z.object({
  id: beId(),
  stage: z.string(),
  originalName: z.string().nullish(),
  uploadedAt: z.string(),
  thumbnailUrl: z.string().nullish(),
});

/** BE `CustomerReturnResponse` — không có ghi chú nội bộ hay ai trong shop làm gì. */
export const customerReturnDtoSchema = z.object({
  id: beId(),
  rmaNumber: z.string(),
  orderId: beId(),
  orderNumber: z.string().nullish(),
  /** BE `CustomerReturnResponse.shipmentId`: lần giao của hàng trả; null với đơn giao một lần. */
  shipmentId: beId().nullish(),
  status: returnStatusSchema,
  reasonCode: returnReasonSchema,
  description: z.string().nullish(),
  requestedResolution: z.string().nullish(),
  requestedAt: z.string(),
  returnRequired: z.boolean().nullish(),
  returnDeadline: z.string().nullish(),
  rejectionReason: z.string().nullish(),
  receivedAt: z.string().nullish(),
  closedAt: z.string().nullish(),
  currency: currencySchema.nullish().catch(null),
  refundedAmount: z.number().nullish(),
  offsetAmount: z.number().nullish(),
  /** WF-05 Q-4: RESOLVED kết thúc bằng hoàn tiền hay không; null trước khi xong. */
  outcome: returnOutcomeSchema.nullish(),
  /** Mã lý do không hoàn tiền (danh sách cố định); chỉ khi `outcome` = REFUSED. */
  refusalReason: returnRefusalReasonSchema.nullish(),
  /** Nhãn tiếng Việt của `refusalReason` do BE gửi (bundle `_vi`); dùng khi FE chưa biết mã. */
  refusalReasonLabel: z.string().nullish(),
  /**
   * Ghi chú công khai tuỳ chọn Sales viết cho khách kèm lý do (BE `CustomerReturnResponse.refusalNote`,
   * Q-4); ghi chú nội bộ không bao giờ tới đây.
   */
  refusalNote: z.string().nullish(),
  lines: z.array(customerReturnLineDtoSchema),
  discrepancies: z
    .array(z.object({ kind: z.string(), sku: z.string(), quantity: z.number().int() }))
    .nullish(),
  evidence: z.array(customerReturnEvidenceDtoSchema).nullish(),
  history: z.array(z.object({ status: z.string(), occurredAt: z.string() })).nullish(),
  version: z.number(),
});

export const evidenceLinkDtoSchema = z.object({ url: z.string() });

// ── Inputs ──

/** BE `ReturnRequests.Open.description` ≤ 2000; `Cancel.reason` ≤ 500. */
export const RETURN_DESCRIPTION_MAX = 2000;
export const RETURN_CANCEL_REASON_MAX = 500;
/** BE `ReturnPolicy.defaults().maxEvidence` và giới hạn tệp của `FileCategory.RETURN_EVIDENCE`. */
export const RETURN_PHOTO_MAX_COUNT = 10;
export const RETURN_PHOTO_MAX_BYTES = 15 * 1024 * 1024;
export const RETURN_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Body của `POST /orders/{orderId}/returns` (BE `ReturnRequests.Open`). */
export const openReturnInputSchema = z
  .object({
    orderId: beId(),
    requestId: beId(),
    reasonCode: z.enum(CUSTOMER_RETURN_REASONS),
    description: z.string().trim().max(RETURN_DESCRIPTION_MAX).optional(),
    lines: z
      .array(z.object({ orderLineId: beId(), quantity: z.number().int().min(1) }))
      .min(1)
      .max(100),
    /**
     * Lần giao đã đến mà hàng trả thuộc về (WF-05 TH-1, BE `ReturnRequests.Open.shipmentId`). Bỏ trống:
     * lần giao duy nhất của đơn; bắt buộc khi đơn đã giao nhiều lần (`RETURN_SHIPMENT_REQUIRED`).
     */
    shipmentId: beId().optional(),
  })
  // BE `ReturnRequest.open`: lý do "Khác" phải mô tả vấn đề.
  .refine((input) => input.reasonCode !== "OTHER" || !!input.description, {
    path: ["description"],
    message: "Hãy mô tả vấn đề khi chọn lý do Khác.",
  });

export type ReturnStatus = z.infer<typeof returnStatusSchema>;
export type ReturnReason = z.infer<typeof returnReasonSchema>;
export type ReturnOutcome = z.infer<typeof returnOutcomeSchema>;
export type ReturnRefusalReason = z.infer<typeof returnRefusalReasonSchema>;
export type ReturnRow = z.infer<typeof returnRowDtoSchema>;
export type ReturnPage = z.infer<typeof returnPageDtoSchema>;
export type CustomerReturn = z.infer<typeof customerReturnDtoSchema>;
export type CustomerReturnLine = z.infer<typeof customerReturnLineDtoSchema>;
export type CustomerReturnEvidence = z.infer<typeof customerReturnEvidenceDtoSchema>;
export type OpenReturnInput = z.infer<typeof openReturnInputSchema>;
