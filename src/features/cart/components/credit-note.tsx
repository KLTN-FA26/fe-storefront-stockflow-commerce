import { Alert } from "@/components/shared";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { creditOutlook, type CreditSummary } from "@/lib/payment-terms";

interface CreditNoteProps {
  credit: CreditSummary;
  total: number;
  /**
   * `order` (the CREDIT term): an order over the limit, or placed while a receivable is overdue, is
   * still placed and the BE holds it (ON_HOLD) for the credit approver.
   * `balance` (the balance of a DEPOSIT order on credit): the BE refuses it instead, so the customer
   * is told to pick another way to pay the balance.
   */
  mode?: "order" | "balance";
}

/**
 * Beside a credit option: what is left of the customer's credit against this amount (SFCREDIT). It
 * only informs; the BE decides.
 */
export function CreditNote({ credit, total, mode = "order" }: CreditNoteProps) {
  const outlook = creditOutlook(credit, total);
  const money = (amount: number) => formatMoney(amount, credit.currency);
  const balance = mode === "balance";
  const held = "Đơn công nợ mới sẽ chờ duyệt công nợ trước khi được xử lý. Bạn vẫn đặt hàng được.";
  const refused = "Hãy chọn cách thanh toán phần còn lại khác, ví dụ “Trả trước khi giao”.";

  if (outlook === "OVERDUE") {
    const since = credit.oldestOverdueDueDate
      ? `, sớm nhất đến hạn ngày ${formatDate(credit.oldestOverdueDueDate)}`
      : "";
    return (
      <div role="status">
        <Alert tone="warning" title="Tài khoản đang có khoản công nợ quá hạn.">
          {credit.overdueAmount > 0
            ? `Số tiền quá hạn: ${money(credit.overdueAmount)}${since}. `
            : ""}
          {balance ? `Hiện chưa thể ghi phần còn lại vào công nợ. ${refused}` : held}
        </Alert>
      </div>
    );
  }
  if (outlook === "NO_LIMIT") {
    return (
      <div role="status">
        <Alert tone="warning" title={`Hạn mức công nợ của bạn là ${money(0)}.`}>
          {balance
            ? `Chưa thể ghi phần còn lại vào công nợ. ${refused}`
            : "Đơn công nợ sẽ chờ duyệt công nợ trước khi được xử lý. Bạn vẫn đặt hàng được."}
        </Alert>
      </div>
    );
  }
  if (outlook === "OVER_LIMIT") {
    return (
      <div role="status">
        <Alert
          tone="warning"
          title={
            balance
              ? "Phần còn lại vượt hạn mức công nợ còn lại."
              : "Đơn vượt hạn mức công nợ còn lại."
          }
        >
          {balance ? "Phần còn lại" : "Giá trị đơn"} {money(total)} lớn hơn hạn mức còn lại{" "}
          {money(credit.available)}.{" "}
          {balance
            ? refused
            : "Bạn vẫn đặt hàng được: đơn sẽ được giữ lại để duyệt công nợ trước khi được xử lý."}
        </Alert>
      </div>
    );
  }
  return (
    <p className="text-ink-secondary text-sm">
      Hạn mức công nợ còn lại:{" "}
      <span className="text-ink-primary font-semibold tabular-nums">{money(credit.available)}</span>
      . Sau {balance ? "khoản này" : "đơn này"} còn{" "}
      <span className="text-ink-primary font-semibold tabular-nums">
        {money(credit.available - total)}
      </span>
      {credit.termDays ? `; thanh toán trong ${credit.termDays} ngày kể từ khi giao hàng` : ""}.
    </p>
  );
}
