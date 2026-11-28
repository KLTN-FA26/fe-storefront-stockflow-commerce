/**
 * The shortage choice card "Đơn thiếu N thùng" as the customer reads it (kltn-docs 17 §4.14 steps 55-60, §5.6, BR-33;
 * 16 §4.7, BR-15; BE `ShortageCardResponse`, the same shape as the chat card's payload). Shared by the chat card and the
 * order page block, so both draw one thing: the payload schema, the words of the four ways on and of the five statuses,
 * and the effect line each way shows (money, date) - never an internal field (LPN, bin, hold reason, internal note).
 */

import { z } from "zod";

import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { tolerantEnum } from "@/lib/validation/tolerant-enum";

import { statusMetaOf, type StatusMeta } from "./status-map";

const money = z.number().nullish();

/** BE `ShortageOption`: the four ways on (17 §4.14 step 56). */
export const SHORTAGE_OPTIONS = [
  "WAIT_FOR_PRODUCTION",
  "REDUCE_CARTONS",
  "SHIP_PART_CLOSE_REST",
  "CANCEL_ORDER",
] as const;
export type ShortageOption = (typeof SHORTAGE_OPTIONS)[number];

/** BE `ShortageCardStatus` (17 §5.6). */
export const SHORTAGE_STATUSES = ["SENT", "ANSWERED", "EXECUTED", "SUPERSEDED", "EXPIRED"] as const;
export type ShortageStatus = (typeof SHORTAGE_STATUSES)[number];

/** BE `ShortageCardEnd`: why a card ended without Sales carrying a choice out. */
const SHORTAGE_END_REASONS = [
  "REALLOCATED",
  "HOLD_RESOLVED_ELSEWHERE",
  "ORDER_CANCELLED",
  "REMAINDER_CLOSED",
  "DECIDED_WITHOUT_CARD",
  "REPLACED",
] as const;

const optionSchema = tolerantEnum(SHORTAGE_OPTIONS);

/** One way on: only the figures of its own option are present (BE `ShortageCardResponse.Option`). */
const shortageOfferSchema = z.object({
  option: optionSchema,
  /** WAIT_FOR_PRODUCTION: the date the missing cartons are expected (17 §4.14 step 56, D48). */
  expectedDeliveryDate: z.string().nullish(),
  /** WAIT_FOR_PRODUCTION: the date is after the batch's window, so choosing it agrees to move the window. */
  afterWindow: z.boolean().nullish(),
  /** REDUCE_CARTONS, SHIP_PART_CLOSE_REST: how much the amount due falls. */
  amountReduced: money,
  /** SHIP_PART_CLOSE_REST: the later batches that are closed too. */
  laterBatchesClosed: z
    .array(z.number().int())
    .nullish()
    .transform((batches) => batches ?? []),
  /** CANCEL_ORDER: the most that is refunded. */
  refundUpTo: money,
  /** CANCEL_ORDER: a fee may be agreed with Sales (an order already in production). */
  feePossible: z.boolean().nullish(),
});

export const shortageCardSchema = z.object({
  cardId: z.string().min(1),
  /** Short code `TT-yyyyMMdd-NNNN` (BE-3 #513); optional - an older BE omits it. */
  code: z.string().nullish(),
  sentAt: z.string().nullish(),
  orderId: z.string().min(1),
  orderNumber: z.string().nullish(),
  status: tolerantEnum(SHORTAGE_STATUSES),
  /** The version a choice must name; a stale one is refused 409. */
  version: z.number().int(),
  batch: z.object({
    seq: z.number().int(),
    windowFrom: z.string().nullish(),
    windowTo: z.string().nullish(),
    moved: z.boolean().nullish(),
  }),
  missingCartons: z.number().int(),
  lines: z.array(
    z.object({
      sku: z.string(),
      skuName: z.string().nullish(),
      batchCartons: z.number().int(),
      availableCartons: z.number().int(),
      missingCartons: z.number().int(),
      unitsPerCarton: z.number().int().nullish(),
    }),
  ),
  options: z.array(shortageOfferSchema),
  salesNote: z.string().nullish(),
  chosen: z.object({ option: optionSchema, at: z.string(), note: z.string().nullish() }).nullish(),
  executedAt: z.string().nullish(),
  executionStarted: z.boolean().nullish(),
  endedReason: tolerantEnum(SHORTAGE_END_REASONS).nullish(),
});

export type ShortageCard = z.infer<typeof shortageCardSchema>;
export type ShortageOffer = ShortageCard["options"][number];
/** A way on this FE can word and send; one the BE added after this FE shipped (`UNKNOWN`) is not offered. */
export type KnownShortageOffer = ShortageOffer & { option: ShortageOption };
export const isKnownOffer = (offer: ShortageOffer): offer is KnownShortageOffer =>
  offer.option !== "UNKNOWN";

/** The customer's note on a choice is at most 500 characters (BE `ShortageChoiceRequest`). */
export const SHORTAGE_NOTE_MAX = 500;

/** What the customer may write with a choice: one optional message. */
export const shortageChoiceNoteSchema = z.object({
  note: z
    .string()
    .max(SHORTAGE_NOTE_MAX, `Tối đa ${SHORTAGE_NOTE_MAX} ký tự.`)
    .optional()
    .transform((note) => note?.trim() ?? ""),
});

/** The body of a choice (chat action `CHOOSE` and the order page's `choice` call). */
export const chooseShortageInputSchema = z.object({
  option: z.enum(SHORTAGE_OPTIONS),
  version: z.number().int(),
  note: z.string().max(SHORTAGE_NOTE_MAX).optional(),
});
export type ChooseShortageInput = z.input<typeof chooseShortageInputSchema>;

/** The Vietnamese name of each way on (BE `label.ShortageOption.*`). */
const OPTION_LABEL: Record<ShortageOption, string> = {
  WAIT_FOR_PRODUCTION: "Chờ sản xuất phần thiếu",
  REDUCE_CARTONS: "Giảm số thùng",
  SHIP_PART_CLOSE_REST: "Giao một phần rồi đóng phần còn lại",
  CANCEL_ORDER: "Huỷ đơn",
};
export const shortageOptionLabel = (option: string): string =>
  OPTION_LABEL[option as ShortageOption] ?? "Hướng xử lý khác";

/** 17 §5.6, in the customer's words. */
const STATUS_META: Record<ShortageStatus, StatusMeta> = {
  SENT: { label: "Chờ anh/chị chọn", tone: "warning" },
  ANSWERED: { label: "Đã chọn, chờ Sale thực hiện", tone: "info" },
  EXECUTED: { label: "Sale đã thực hiện", tone: "positive" },
  SUPERSEDED: { label: "Đã có thẻ mới thay thế", tone: "muted" },
  EXPIRED: { label: "Không cần chọn nữa", tone: "muted" },
};
export const shortageStatusMeta = (status: string): StatusMeta =>
  statusMetaOf(STATUS_META, status, "Thiếu thùng");

/** What the customer calls the card: its code, else "Thẻ thiếu thùng ngày dd/MM/yyyy" - never the card id. */
export function shortageCardName(card: Pick<ShortageCard, "code" | "sentAt">): string {
  if (card.code) return card.code;
  return card.sentAt ? `Thẻ thiếu thùng ngày ${formatDate(card.sentAt)}` : "Thẻ thiếu thùng";
}

/** The card's title: "Đơn thiếu 2 thùng". */
export const shortageTitle = (card: Pick<ShortageCard, "missingCartons">): string =>
  `Đơn thiếu ${card.missingCartons} thùng`;

/** The delivery window of the batch: "Đợt 1 · giao 05/12/2026 - 10/12/2026". */
export function shortageBatchText(batch: ShortageCard["batch"]): string {
  const { seq, windowFrom, windowTo } = batch;
  if (windowFrom && windowTo) {
    return `Đợt ${seq} · giao ${formatDate(windowFrom)} - ${formatDate(windowTo)}`;
  }
  return `Đợt ${seq}`;
}

/** Anything the customer may still choose: the card waits for their answer (17 §5.6 `Sent`). */
export const isShortageOpen = (card: Pick<ShortageCard, "status">): boolean =>
  card.status === "SENT";

/**
 * What choosing a way costs or changes, as the lines under its button (17 §4.14 step 56): the figures
 * were computed by the BE when the card was sent. A figure the BE did not send leaves its line out.
 */
export function shortageEffectLines(
  offer: ShortageOffer,
  card: Pick<ShortageCard, "missingCartons">,
): string[] {
  const lines: string[] = [];
  switch (offer.option) {
    case "WAIT_FOR_PRODUCTION":
      if (offer.expectedDeliveryDate) {
        lines.push(`Dự kiến giao từ ${formatDate(offer.expectedDeliveryDate)}.`);
      }
      if (offer.afterWindow) {
        lines.push("Chọn hướng này là đồng ý dời lịch giao tới ngày đó.");
      }
      lines.push("Số tiền phải trả không đổi.");
      break;
    case "REDUCE_CARTONS":
      lines.push(
        `Bỏ ${card.missingCartons} thùng thiếu của đợt này${
          offer.amountReduced == null
            ? "."
            : `, số phải trả giảm ${formatMoney(offer.amountReduced)}.`
        }`,
        "Không cần phụ lục hợp đồng, không mất phí.",
      );
      break;
    case "SHIP_PART_CLOSE_REST":
      lines.push(
        `Giao trước các thùng đã có, rồi đóng phần còn lại của đơn${
          offer.amountReduced == null
            ? "."
            : `; số phải trả giảm ${formatMoney(offer.amountReduced)}.`
        }`,
      );
      if (offer.laterBatchesClosed.length > 0) {
        lines.push(`Các đợt sau (đợt ${offer.laterBatchesClosed.join(", ")}) cũng bị đóng.`);
      }
      break;
    case "CANCEL_ORDER":
      lines.push(
        offer.refundUpTo == null
          ? "Huỷ cả đơn."
          : `Huỷ cả đơn. Hoàn tối đa ${formatMoney(offer.refundUpTo)}${
              offer.feePossible ? "; phí (nếu có) theo thoả thuận với Sale." : "."
            }`,
      );
      break;
    default:
      break;
  }
  return lines;
}
