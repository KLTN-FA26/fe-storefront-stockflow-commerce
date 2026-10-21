import { Alert } from "@/components/shared";
import { formatMoney } from "@/lib/format/money";
import { creditOutlook, type CreditSummary } from "@/lib/payment-terms";

/**
 * Beside the CREDIT term: what is left of the customer's credit against this order's total
 * (SFCREDIT). It only informs: an order over the limit, or placed while a receivable is overdue,
 * is still placed and the BE holds it (ON_HOLD) for the credit approver.
 */
export function CreditNote({ credit, total }: { credit: CreditSummary; total: number }) {
  const outlook = creditOutlook(credit, total);
  const money = (amount: number) => formatMoney(amount, credit.currency);

  if (outlook === "OVERDUE") {
    return (
      <div role="status">
        <Alert tone="warning" title="Tài khoản đang có khoản công nợ quá hạn.">
          Đơn công nợ mới sẽ chờ duyệt công nợ trước khi được xử lý. Bạn vẫn đặt hàng được.
        </Alert>
      </div>
    );
  }
  if (outlook === "OVER_LIMIT") {
    return (
      <div role="status">
        <Alert tone="warning" title="Đơn vượt hạn mức công nợ còn lại.">
          Giá trị đơn {money(total)} lớn hơn hạn mức còn lại {money(credit.available)}. Bạn vẫn đặt
          hàng được: đơn sẽ được giữ lại để duyệt công nợ trước khi được xử lý.
        </Alert>
      </div>
    );
  }
  return (
    <p className="text-ink-secondary text-sm">
      Hạn mức công nợ còn lại:{" "}
      <span className="text-ink-primary font-semibold tabular-nums">{money(credit.available)}</span>
      . Sau đơn này còn{" "}
      <span className="text-ink-primary font-semibold tabular-nums">
        {money(credit.available - total)}
      </span>
      {credit.termDays ? `; thanh toán trong ${credit.termDays} ngày kể từ khi giao hàng` : ""}.
    </p>
  );
}
