import { z } from "zod";

import {
  CUSTOMER_RETURN_REASONS,
  NAMED_FAULT_REASONS,
  RETURN_DESCRIPTION_MAX,
  RETURN_PHOTO_MAX_COUNT,
  claimsByOrderLine,
  type CustomerReturn,
} from "@/lib/returns";

import type { OrderLine } from "./types";

/** Quyền mở yêu cầu trả hàng (CUSTOMER có `sales-rmas:CREATE` scope OWN). */
export const RETURN_CREATE_PERMISSION = "sales-rmas:CREATE";

/** Một dòng đơn trên form trả hàng: còn trả được bao nhiêu cái và vì sao không. */
export interface ReturnableLine {
  lineId: string;
  sku: string;
  /** In theo thiết kế của khách: chỉ trả khi có lỗi được gọi tên (BR-RMA-002). */
  printed: boolean;
  delivered: number;
  unitsPerCarton: number | null;
  /** Đã bị các yêu cầu khác giữ (BE `ReturnLine.claimedUnits`). */
  claimed: number;
  max: number;
  /** Dòng đang có yêu cầu trả hàng khác chưa xong (BE `RETURN_LINE_ALREADY_OPEN`). */
  open: boolean;
}

export function returnableLines(
  lines: readonly OrderLine[],
  returns: readonly CustomerReturn[],
): ReturnableLine[] {
  const { claimed, open } = claimsByOrderLine(returns);
  return lines.map((line) => {
    const held = claimed.get(line.lineId) ?? 0;
    return {
      lineId: line.lineId,
      sku: line.sku,
      printed: !!line.designSnapshotId,
      delivered: line.quantity,
      unitsPerCarton: line.unitsPerCarton ?? null,
      claimed: held,
      max: Math.max(line.quantity - held, 0),
      open: open.has(line.lineId),
    };
  });
}

/**
 * Form trả hàng (BE `ReturnRequest.open` + `ReturnPolicy`): ít nhất một dòng có số lượng, lý do,
 * mô tả khi "Khác", và ít nhất một ảnh — Sales chỉ duyệt khi có ảnh của vấn đề (BE
 * `RETURN_EVIDENCE_REQUIRED`, `ReturnPolicy.evidenceRequired`).
 */
export function returnFormSchema(lines: readonly ReturnableLine[]) {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  return z
    .object({
      quantities: z.record(z.string(), z.number().int().min(0)),
      reasonCode: z.enum(CUSTOMER_RETURN_REASONS, { message: "Chọn lý do trả hàng." }),
      description: z.string().trim().max(RETURN_DESCRIPTION_MAX, "Mô tả tối đa 2000 ký tự."),
      photos: z
        .array(z.instanceof(File))
        .min(1, "Thêm ít nhất 1 ảnh cho thấy vấn đề.")
        .max(RETURN_PHOTO_MAX_COUNT, `Tối đa ${RETURN_PHOTO_MAX_COUNT} ảnh.`),
    })
    .superRefine((values, ctx) => {
      const chosen = Object.entries(values.quantities).filter(([, qty]) => qty > 0);
      if (chosen.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["quantities"],
          message: "Chọn ít nhất một sản phẩm và số lượng muốn trả.",
        });
      }
      for (const [lineId, qty] of chosen) {
        const line = byId.get(lineId);
        if (!line || line.open || qty > line.max) {
          ctx.addIssue({
            code: "custom",
            path: ["quantities", lineId],
            message: line?.open
              ? "Sản phẩm này đang có yêu cầu trả hàng khác."
              : `Tối đa ${line?.max ?? 0} cái.`,
          });
        }
        // BR-RMA-002 (17 BR-08): hàng in theo thiết kế chỉ trả vì lỗi được gọi tên.
        if (line?.printed && !NAMED_FAULT_REASONS.includes(values.reasonCode)) {
          ctx.addIssue({
            code: "custom",
            path: ["reasonCode"],
            message: "Hàng in theo thiết kế của bạn chỉ trả được khi có lỗi — hãy chọn lỗi cụ thể.",
          });
        }
      }
      if (values.reasonCode === "OTHER" && !values.description) {
        ctx.addIssue({
          code: "custom",
          path: ["description"],
          message: "Hãy mô tả vấn đề khi chọn lý do Khác.",
        });
      }
    });
}

export type ReturnFormInput = z.input<ReturnType<typeof returnFormSchema>>;
export type ReturnFormValues = z.output<ReturnType<typeof returnFormSchema>>;

export const RETURN_REASON_HELP: Record<(typeof CUSTOMER_RETURN_REASONS)[number], string> = {
  PRINT_DEFECT: "Bản in nhoè, phai, lệch hoặc sai màu.",
  DESIGN_MISMATCH: "Bản in khác với mẫu bạn đã duyệt.",
  DAMAGED_IN_TRANSIT: "Hàng móp, vỡ, ướt khi nhận.",
  WRONG_ITEM: "Nhận được sản phẩm khác với dòng đơn.",
  OTHER: "Vấn đề khác — mô tả rõ bên dưới.",
};
