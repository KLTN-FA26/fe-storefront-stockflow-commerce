import { hasUnsellableLine } from "@/lib/domain/quote-purchasability";
import { ORDER_STATUS, QUOTE_STATUS, type OrderDisplayGroupKey } from "@/lib/domain/status-map";
import type { SemanticTone } from "@/lib/domain/types";

import type { Quote, QuoteLine, QuoteRow, QuoteStatus, QuoteStatusFilter } from "./types";

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
  /**
   * POST /acceptance: only a SENT, valid, non-legacy quote, only the customer (sales-quotes:APPROVE),
   * and only while every line may still be bought (01 BR-04; the BE refuses SKU_NOT_SELLABLE).
   */
  accept: boolean;
  /** POST /change-request: same window as accepting, open even when a line can no longer be bought. */
  requestChanges: boolean;
}

const NONE: QuoteActions = { accept: false, requestChanges: false };

/**
 * What the customer may do with the quote now. UI gating only — the BE checks the status, the
 * validity, the version and each SKU again (INVALID_QUOTE_TRANSITION, QUOTE_EXPIRED,
 * OPTIMISTIC_LOCK, SKU_NOT_SELLABLE). EXPIRED, CANCELLED, CONVERTED, CHANGES_REQUESTED and ACCEPTED
 * are read only. A line whose product was stopped (WF-02 FE-1) blocks accepting only: asking Sale
 * to revise the quote is how the customer gets out of it.
 */
export function allowedQuoteActions(
  quote: Pick<Quote, "status" | "validUntil" | "legacy"> & {
    lines: readonly Pick<QuoteLine, "purchasability">[];
  },
  { canAnswer, now = new Date() }: { canAnswer: boolean; now?: Date },
): QuoteActions {
  if (!canAnswer || quote.legacy || effectiveStatus(quote, now) !== "SENT") return NONE;
  return { accept: !hasUnsellableLine(quote.lines), requestChanges: true };
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
 * The order's own status (BE QuoteResponse.Order#status) as the customer reads it: the label of
 * its status group (lib/domain ORDER_STATUS), so the quote and the order page agree. A status this
 * FE does not know reads "Đang xử lý".
 */
const ORDER_GROUP_OF_STATUS: Readonly<Record<string, OrderDisplayGroupKey>> = {
  PENDING_CONTRACT: "AWAITING_CONTRACT",
  PENDING_PAYMENT: "AWAITING_PAYMENT",
  ON_HOLD: "UNDER_REVIEW",
  CONFIRMED: "CONFIRMED",
  AWAITING_STOCK: "AWAITING_STOCK",
  IN_PRODUCTION: "IN_PRODUCTION",
  READY_TO_FULFILL: "PREPARING",
  PICKING: "PREPARING",
  PACKED: "PREPARING",
  PARTIALLY_FULFILLED: "PREPARING",
  IN_FULFILMENT: "PREPARING",
  SHIPPED: "SHIPPING",
  DELIVERY_FAILED: "SHIPPING",
  DELIVERED: "DELIVERED",
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
  REFUNDED: "RETURNED",
  PARTIALLY_REFUNDED: "PARTIALLY_RETURNED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CLOSED: "CLOSED",
};

export const convertedOrderStatusLabel = (status: string): string =>
  ORDER_STATUS[ORDER_GROUP_OF_STATUS[status] ?? "UNKNOWN"].label;

/** No order shown yet: the BE hides a DRAFT order, whose contract Sales are still drawing up. */
const CONTRACT_BEING_DRAWN =
  "Sale đang lập hợp đồng; bạn sẽ nhận hợp đồng để ký trong mục Chat và trang đơn hàng.";

/**
 * The hint under a quote's status on its page. A CONVERTED quote's order only reaches the customer
 * once the contract is sent (BE QuoteService.view hides a DRAFT order), so no `convertedOrder` means
 * Sale is still drawing the contract up; with it, the order's real status (UI/UX 27/11, sf-05).
 */
export function quoteStatusHint(
  status: QuoteStatus,
  quote?: Pick<Quote, "convertedOrder">,
): string {
  if (status === "CONVERTED") {
    const order = quote?.convertedOrder;
    return order
      ? `Đơn ${order.orderNumber} đang ở trạng thái “${convertedOrderStatusLabel(order.status)}”. Xem hợp đồng, thanh toán và giao hàng ở trang đơn.`
      : CONTRACT_BEING_DRAWN;
  }
  return QUOTE_STATUS_META[status].hint;
}

/**
 * The hint on a list row. The row names the order only once its contract was sent
 * (`convertedOrderNumber`, BE QuoteRowResponse), not its status: it says where to follow the order
 * instead of promising a contract that may long be signed (UI/UX 27/11, sf-04).
 */
export function quoteListHint(
  status: QuoteStatus,
  row?: Pick<QuoteRow, "convertedOrderNumber">,
): string {
  if (status !== "CONVERTED") return QUOTE_STATUS_META[status].hint;
  return row?.convertedOrderNumber
    ? `Đã tạo đơn ${row.convertedOrderNumber}; theo dõi hợp đồng, thanh toán và giao hàng ở trang đơn.`
    : CONTRACT_BEING_DRAWN;
}
