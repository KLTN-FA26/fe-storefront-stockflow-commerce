import type { SemanticTone } from "@/lib/domain/types";

import type { Quote, QuoteStatus, QuoteStatusFilter } from "./types";

// Quote lifecycle as the customer meets it (kltn-docs 14 §5.1): Sales draft, the customer answers
// a SENT quote within its validity, Sales take it from there. A customer never sees a DRAFT.

/**
 * The status as of `now`: a SENT quote past its validity is EXPIRED (14 §4.1 step 4 "được coi là hết
 * hiệu lực ngay khi qua hạn"; BE Quote.statusAt). The BE already reports it so on every read; this
 * covers a page left open across the deadline.
 */
export function effectiveStatus(
  quote: Pick<Quote, "status" | "validUntil">,
  now: Date = new Date(),
): QuoteStatus {
  if (quote.status === "SENT" && now.getTime() >= Date.parse(quote.validUntil)) return "EXPIRED";
  return quote.status;
}

export interface QuoteActions {
  /** POST /acceptance: only a SENT, valid, non-legacy quote, and only the customer (sales-quotes:APPROVE). */
  accept: boolean;
  /** POST /change-request: same window as accepting. */
  requestChanges: boolean;
}

const NONE: QuoteActions = { accept: false, requestChanges: false };

/**
 * What the customer may do with the quote now. UI gating only — the BE checks the status, the
 * validity and the version again (INVALID_QUOTE_TRANSITION, QUOTE_EXPIRED, OPTIMISTIC_LOCK).
 * EXPIRED, CANCELLED, CONVERTED, CHANGES_REQUESTED and ACCEPTED are read only.
 */
export function allowedQuoteActions(
  quote: Pick<Quote, "status" | "validUntil" | "legacy">,
  { canAnswer, now = new Date() }: { canAnswer: boolean; now?: Date },
): QuoteActions {
  if (!canAnswer || quote.legacy || effectiveStatus(quote, now) !== "SENT") return NONE;
  return { accept: true, requestChanges: true };
}

/** Customer-facing label, tone (special > danger > positive > warning > info > muted > neutral), hint. */
export const QUOTE_STATUS_META: Record<
  QuoteStatus,
  { label: string; tone: SemanticTone; hint: string }
> = {
  DRAFT: { label: "Nháp", tone: "neutral", hint: "Sale đang soạn báo giá." },
  SENT: {
    label: "Đã gửi",
    tone: "warning",
    hint: "Báo giá đang chờ bạn chấp nhận hoặc yêu cầu sửa trước khi hết hiệu lực.",
  },
  CHANGES_REQUESTED: {
    label: "Yêu cầu sửa",
    tone: "info",
    hint: "Bạn đã yêu cầu sửa. Sale sẽ gửi bản sửa mới.",
  },
  ACCEPTED: {
    label: "Đã chấp nhận",
    tone: "positive",
    hint: "Bạn đã chấp nhận báo giá. Sale sẽ lập đơn và gửi hợp đồng để ký.",
  },
  EXPIRED: {
    label: "Hết hiệu lực",
    tone: "muted",
    hint: "Báo giá đã hết hiệu lực. Hãy chat với Sale để nhận báo giá mới.",
  },
  CANCELLED: { label: "Đã huỷ", tone: "danger", hint: "Sale đã huỷ báo giá này." },
  CONVERTED: {
    label: "Đã tạo đơn",
    tone: "positive",
    hint: "Đơn hàng đã được tạo từ báo giá này.",
  },
  UNKNOWN: {
    label: "Đang cập nhật",
    tone: "neutral",
    hint: "Hãy chat với Sale nếu bạn cần biết tình trạng báo giá này.",
  },
};

/** The statuses the list can be filtered by, in the order a customer meets them. */
export const QUOTE_STATUS_FILTERS: readonly QuoteStatusFilter[] = [
  "SENT",
  "CHANGES_REQUESTED",
  "ACCEPTED",
  "CONVERTED",
  "EXPIRED",
  "CANCELLED",
];

export const isQuoteStatusFilter = (value: string | null | undefined): value is QuoteStatusFilter =>
  value != null && (QUOTE_STATUS_FILTERS as readonly string[]).includes(value);
