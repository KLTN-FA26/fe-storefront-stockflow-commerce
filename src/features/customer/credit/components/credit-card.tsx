"use client";

import { WalletCards } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { formatMoney } from "@/lib/format/money";
import { creditSummary, useMyCreditPosition } from "@/lib/credit-position";
import { formatDate } from "@/lib/format/date";
import { useSignedIn } from "@/lib/auth/use-signed-in";

/**
 * The customer's own credit position on the account page (SFCREDIT; kltn-docs 15 §4.3, 18 §2): limit,
 * what the installments paid after delivery still owe, what is left, the days to pay and a warning
 * while an installment is overdue. Read from GET /orders/credit-position/me. A customer with neither
 * credit nor anything owed sees nothing; nothing is shown while the position is not loaded.
 */
export function CreditCard() {
  const signedIn = useSignedIn();
  const query = useMyCreditPosition(signedIn === true);
  const credit = query.data ? creditSummary(query.data) : undefined;

  if (query.isPending && signedIn === true) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-40 w-full rounded-[var(--r-lg)]" />
    );
  }
  // Not loaded: whether credit matters to this customer is unknown, and a customer without credit
  // must not be shown a credit warning.
  if (!credit) return null;

  const money = (amount: number) => formatMoney(amount, credit.currency);
  const usedPercent =
    credit.limit > 0 ? Math.min(100, Math.round((credit.exposure / credit.limit) * 100)) : 0;
  const rows = credit.hasCredit
    ? [
        { label: "Hạn mức", value: money(credit.limit) },
        { label: "Dư nợ", value: money(credit.exposure) },
        { label: "Còn lại", value: money(credit.available) },
      ]
    : [{ label: "Dư nợ", value: money(credit.exposure) }];

  return (
    <SurfaceCard className="space-y-4">
      <Heading />
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-ink-secondary text-sm">{row.label}</dt>
            <dd className="text-ink-primary font-display text-lg font-bold tabular-nums">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {credit.limit > 0 ? (
        <div
          role="img"
          aria-label={`Đã dùng ${usedPercent}% hạn mức`}
          className="bg-bg-muted h-2 overflow-hidden rounded-full"
        >
          <div
            className={credit.available > 0 ? "bg-accent h-full" : "bg-danger h-full"}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
      ) : null}
      <p className="text-ink-tertiary text-xs">
        Dư nợ gồm các đợt thanh toán sau giao hàng của hợp đồng đã ký chưa trả đủ (kể cả đợt chưa
        đến hạn) và phí huỷ đơn chưa thanh toán.
      </p>
      {credit.hasCredit && credit.limit <= 0 ? (
        <div role="status">
          <Alert tone="warning" title="Hạn mức công nợ của bạn là 0 ₫.">
            Hợp đồng có đợt thanh toán sau giao hàng sẽ chờ kế toán duyệt công nợ khi ký. Vui lòng
            liên hệ Sales nếu cần thêm hạn mức.
          </Alert>
        </div>
      ) : null}
      {credit.termDays ? (
        <p className="text-ink-secondary text-sm">
          Kỳ hạn thanh toán:{" "}
          <span className="text-ink-primary font-semibold">{credit.termDays} ngày</span> kể từ khi
          giao hàng.
        </p>
      ) : null}
      {credit.overdue ? (
        <div role="alert">
          <Alert tone="warning" title="Bạn có khoản công nợ quá hạn.">
            {credit.overdueAmount > 0
              ? `Còn ${money(credit.overdueAmount)} quá hạn${
                  credit.oldestOverdueDueDate
                    ? ` (sớm nhất từ ${formatDate(credit.oldestOverdueDueDate)})`
                    : ""
                }. `
              : ""}
            Hợp đồng mới sẽ chờ kế toán duyệt cho đến khi khoản quá hạn được thanh toán. Vui lòng
            liên hệ Sales nếu cần hỗ trợ.
          </Alert>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <WalletCards aria-hidden className="text-accent size-5" />
      <h2 id="credit-heading" className="font-display text-ink-primary text-lg font-bold">
        Công nợ
      </h2>
    </div>
  );
}
