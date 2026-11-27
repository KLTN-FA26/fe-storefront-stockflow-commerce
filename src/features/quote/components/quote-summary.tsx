import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { QUOTE_STATUS_META } from "../lifecycle";
import { customerHistory, shownTotals } from "../selectors";
import type { Quote, QuoteStatus } from "../types";
import { Fact, QUOTE_CARD } from "./quote-lines";

const money = (amount: number | null | undefined) => (amount == null ? "—" : formatMoney(amount));

function Row({ label, children, strong }: { label: string; children: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? "text-ink-primary font-semibold" : "text-ink-secondary"}>{label}</dt>
      <dd
        className={
          strong
            ? "font-display text-ink-primary text-xl font-bold tabular-nums"
            : "text-ink-primary font-medium tabular-nums"
        }
      >
        {children}
      </dd>
    </div>
  );
}

/** Goods + fees + VAT = total with tax, as the BE answered it (accepted once accepted). */
export function QuoteTotalsCard({ quote }: { quote: Pick<Quote, "accepted" | "proposed"> }) {
  const totals = shownTotals(quote);
  return (
    <section className={QUOTE_CARD} aria-labelledby="quote-totals-heading">
      <h2
        id="quote-totals-heading"
        className="font-display text-ink-primary mb-2 text-base font-semibold"
      >
        {quote.accepted ? "Tổng đã chấp nhận" : "Tổng báo giá"}
      </h2>
      <dl className="space-y-2 text-sm">
        <Row label="Tiền hàng">{money(totals?.subtotal)}</Row>
        {/* No fee on the quote: no "Phí 0 ₫" line (sf-05). Unknown (absent) still shows "—". */}
        {totals?.fees === 0 ? null : <Row label="Phí">{money(totals?.fees)}</Row>}
        <Row label="Thuế VAT">{money(totals?.tax)}</Row>
        <Row label="Tổng có VAT" strong>
          {money(totals?.total)}
        </Row>
      </dl>
    </section>
  );
}

/**
 * Validity, requested delivery date, terms; what the customer asked, why Sales cancelled. The order
 * made from the quote is linked from the page header.
 */
export function QuoteInfoCard({ quote, status }: { quote: Quote; status: QuoteStatus }) {
  return (
    <section className={`${QUOTE_CARD} space-y-3`} aria-labelledby="quote-info-heading">
      <h2 id="quote-info-heading" className="font-display text-ink-primary text-base font-semibold">
        Thông tin báo giá
      </h2>
      <dl className="grid grid-cols-2 gap-3">
        {status === "CHANGES_REQUESTED" ? null : (
          <Fact label="Hiệu lực đến">{formatDateTime(quote.validUntil)}</Fact>
        )}
        <Fact label="Ngày giao yêu cầu">
          {quote.requestedDeliveryDate ? formatDate(quote.requestedDeliveryDate) : "Chưa có"}
        </Fact>
        <Fact label="Ngày gửi">{quote.sentAt ? formatDate(quote.sentAt) : "—"}</Fact>
        <Fact label="Bản sửa">Số {quote.revision}</Fact>
      </dl>
      {status === "CHANGES_REQUESTED" ? (
        <p className="text-ink-secondary text-sm">
          Sale đang soạn bản sửa theo yêu cầu của bạn. Hạn hiệu lực sẽ có trên bản sửa mới.
        </p>
      ) : null}
      {quote.terms ? (
        <div>
          <h3 className="text-ink-tertiary text-xs">Điều khoản</h3>
          <p className="text-ink-primary text-sm whitespace-pre-line">{quote.terms}</p>
        </div>
      ) : null}
      {quote.customerFeedback ? (
        <div>
          <h3 className="text-ink-tertiary text-xs">Yêu cầu sửa của bạn</h3>
          <p className="text-ink-primary text-sm whitespace-pre-line">{quote.customerFeedback}</p>
        </div>
      ) : null}
      {status === "CANCELLED" && quote.cancellationReason ? (
        <div>
          <h3 className="text-ink-tertiary text-xs">Lý do huỷ</h3>
          <p className="text-ink-primary text-sm">{quote.cancellationReason}</p>
        </div>
      ) : null}
    </section>
  );
}

/** Status changes, oldest first, in the customer's words (BE history rows). */
export function QuoteHistory({ quote }: { quote: Pick<Quote, "history" | "revision"> }) {
  const history = customerHistory(quote.history, quote.revision);
  if (history.length === 0) return null;
  return (
    <section className={QUOTE_CARD} aria-labelledby="quote-history-heading">
      <h2
        id="quote-history-heading"
        className="font-display text-ink-primary mb-2 text-base font-semibold"
      >
        Lịch sử
      </h2>
      <ol className="space-y-2 text-sm">
        {history.map((entry) => {
          const meta = QUOTE_STATUS_META[entry.toStatus];
          return (
            <li key={`${entry.toStatus}-${entry.changedAt}`} className="flex justify-between gap-3">
              <span className="text-ink-primary">
                {meta.label}
                {entry.revision == null ? null : (
                  <span className="text-ink-tertiary"> · bản sửa {entry.revision}</span>
                )}
              </span>
              <span className="text-ink-secondary shrink-0 tabular-nums">
                {formatDateTime(entry.changedAt)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
