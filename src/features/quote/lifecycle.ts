import { QUOTE_STATUS } from "@/lib/domain/status-map";
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

/** What happens next for each status, under its badge. */
const QUOTE_STATUS_HINT: Record<QuoteStatus, string> = {
  DRAFT: "Sale đang soạn báo giá.",
  SENT: "Báo giá đang chờ bạn chấp nhận hoặc yêu cầu sửa trước khi hết hiệu lực.",
  CHANGES_REQUESTED: "Bạn đã yêu cầu sửa. Sale sẽ gửi bản sửa mới.",
  ACCEPTED: "Bạn đã chấp nhận báo giá. Sale sẽ lập đơn và gửi hợp đồng để ký.",
  EXPIRED: "Báo giá đã hết hiệu lực. Hãy chat với Sale để nhận báo giá mới.",
  CANCELLED: "Sale đã huỷ báo giá này.",
  CONVERTED: "Đơn hàng đã được tạo từ báo giá này.",
  UNKNOWN: "Hãy chat với Sale nếu bạn cần biết tình trạng báo giá này.",
};

/**
 * Customer-facing label and tone (the shared status map, so the chat card says the same), and the
 * hint for each status.
 */
export const QUOTE_STATUS_META: Record<
  QuoteStatus,
  { label: string; tone: SemanticTone; hint: string }
> = Object.fromEntries(
  (Object.keys(QUOTE_STATUS_HINT) as QuoteStatus[]).map((status) => [
    status,
    { ...QUOTE_STATUS[status], hint: QUOTE_STATUS_HINT[status] },
  ]),
) as Record<QuoteStatus, { label: string; tone: SemanticTone; hint: string }>;

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

/**
 * The hint under a quote's status on its page. A CONVERTED quote's order only reaches the customer
 * once the contract is sent (BE QuoteService.view hides a DRAFT order), so no `convertedOrder` means
 * Sale is still drawing the contract up.
 */
export function quoteStatusHint(
  status: QuoteStatus,
  quote?: Pick<Quote, "convertedOrder">,
): string {
  if (status === "CONVERTED") {
    return quote?.convertedOrder
      ? `Đơn hàng ${quote.convertedOrder.orderNumber} đã được tạo. Xem hợp đồng và thanh toán ở trang đơn.`
      : "Sale đang lập hợp đồng; bạn sẽ nhận hợp đồng để ký trong mục Chat và trang đơn hàng.";
  }
  return QUOTE_STATUS_META[status].hint;
}

/**
 * The hint on a list row. The list's `convertedOrderId` is not filtered the way the page's order is,
 * so a row cannot tell a draft order from a sent one: CONVERTED gets the general sentence.
 */
export const quoteListHint = (status: QuoteStatus): string =>
  status === "CONVERTED"
    ? "Đơn hàng đã được tạo; Sale sẽ gửi hợp đồng để bạn ký."
    : QUOTE_STATUS_META[status].hint;
