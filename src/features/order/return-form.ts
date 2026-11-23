import { z } from "zod";

import {
  CUSTOMER_RETURN_REASONS,
  NAMED_FAULT_REASONS,
  RETURN_DESCRIPTION_MAX,
  RETURN_PHOTO_MAX_COUNT,
  claimsByOrderLine,
  type CustomerReturn,
  type ReturnShipmentLine,
  type ReturnableShipment,
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
  /** Số đã giao: của lần giao đã chọn khi BE gửi hàng của nó, không thì của cả đơn. */
  delivered: number;
  unitsPerCarton: number | null;
  /** Đã bị các yêu cầu khác giữ (BE `ReturnLine.claimedUnits`) — của lần giao khi biết hàng của nó. */
  claimed: number;
  max: number;
  /**
   * Dòng đang có yêu cầu trả hàng khác chưa xong (BE `RETURN_LINE_ALREADY_OPEN`) — của cùng lần giao
   * khi đã biết lần giao.
   */
  open: boolean;
}

/**
 * Số còn trả được của mỗi dòng. `delivery`: lần giao khách chọn — chỉ yêu cầu của lần giao đó chặn
 * dòng. Khi BE gửi hàng của lần giao (`delivery.lines`, WF-05 TH-1) thì chỉ các dòng lần giao đó mang
 * mới hiện, "đã giao" là số lần giao đó mang và tối đa là `returnableQuantity` BE tính (0: khoá dòng).
 * BE cũ không gửi: tối đa tính theo cả đơn, BE kiểm lại (`RETURN_QUANTITY_EXCEEDED`).
 */
export function returnableLines(
  lines: readonly OrderLine[],
  returns: readonly CustomerReturn[],
  delivery?: {
    shipmentId: string | null;
    lines?: readonly ReturnShipmentLine[] | null | undefined;
  },
): ReturnableLine[] {
  const { claimed, open } = claimsByOrderLine(returns, delivery);
  const carried = delivery?.lines
    ? new Map(delivery.lines.map((line) => [line.orderLineId, line]))
    : null;
  // Per shipment, "đã yêu cầu trả" counts only the returns of that shipment, like its quantity.
  const heldHere = delivery?.lines
    ? claimsByOrderLine(
        returns.filter((request) => (request.shipmentId ?? null) === delivery.shipmentId),
      ).claimed
    : claimed;
  return lines.flatMap((line) => {
    const base = {
      lineId: line.lineId,
      sku: line.sku,
      printed: !!line.designSnapshotId,
      unitsPerCarton: line.unitsPerCarton ?? null,
      open: open.has(line.lineId),
    };
    if (!carried) {
      const held = claimed.get(line.lineId) ?? 0;
      return [
        {
          ...base,
          delivered: line.quantity,
          claimed: held,
          max: Math.max(line.quantity - held, 0),
        },
      ];
    }
    const onShipment = carried.get(line.lineId);
    if (!onShipment) return [];
    return [
      {
        ...base,
        delivered: onShipment.quantity,
        claimed: heldHere.get(line.lineId) ?? 0,
        max: Math.max(onShipment.returnableQuantity, 0),
      },
    ];
  });
}

/**
 * Số lượng trên form sau khi đổi lần giao: chỉ các dòng của lần giao mới, mỗi dòng giữ số đã chọn
 * nhưng không quá tối đa của lần giao đó (dòng bị khoá về 0).
 */
export function quantitiesFor(
  lines: readonly ReturnableLine[],
  previous: Readonly<Record<string, number | undefined>> = {},
): Record<string, number> {
  return Object.fromEntries(
    lines.map((line) => [
      line.lineId,
      line.open ? 0 : Math.min(Math.max(previous[line.lineId] ?? 0, 0), line.max),
    ]),
  );
}

/**
 * Form trả hàng (BE `ReturnRequest.open` + `ReturnPolicy`): ít nhất một dòng có số lượng, lý do,
 * mô tả khi "Khác", và ít nhất một ảnh — Sales chỉ duyệt khi có ảnh của vấn đề (BE
 * `RETURN_EVIDENCE_REQUIRED`, `ReturnPolicy.evidenceRequired`).
 */
export function returnFormSchema(
  lines: readonly ReturnableLine[],
  delivery: { shipments: readonly ReturnableShipment[]; needsChoice: boolean } = {
    shipments: [],
    needsChoice: false,
  },
) {
  const byId = new Map(lines.map((line) => [line.lineId, line]));
  return z
    .object({
      /** Lần giao có hàng muốn trả — bắt buộc khi đơn đã giao nhiều lần (WF-05 TH-1). */
      shipmentId: z.string().optional(),
      quantities: z.record(z.string(), z.number().int().min(0)),
      reasonCode: z.enum(CUSTOMER_RETURN_REASONS, { message: "Chọn lý do trả hàng." }),
      description: z.string().trim().max(RETURN_DESCRIPTION_MAX, "Mô tả tối đa 2000 ký tự."),
      photos: z
        .array(z.instanceof(File))
        .min(1, "Thêm ít nhất 1 ảnh cho thấy vấn đề.")
        .max(RETURN_PHOTO_MAX_COUNT, `Tối đa ${RETURN_PHOTO_MAX_COUNT} ảnh.`),
    })
    .superRefine((values, ctx) => {
      if (delivery.needsChoice) {
        const shipment = delivery.shipments.find((s) => s.shipmentId === values.shipmentId);
        // The BE's returnableQuantity decides (SF-05); the FE's window only words why not.
        if (!shipment || !shipment.returnable) {
          ctx.addIssue({
            code: "custom",
            path: ["shipmentId"],
            message: !shipment
              ? "Chọn lần giao có hàng muốn trả."
              : shipment.windowOpen
                ? "Lần giao này không còn sản phẩm nào trả được."
                : "Lần giao này đã quá hạn đổi / trả.",
          });
        }
      }
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
