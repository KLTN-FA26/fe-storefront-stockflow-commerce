"use client";

import { RefreshCw, WalletCards } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { SurfaceCard } from "@/components/storefront/layout";
import { describeApiError } from "@/lib/api/describe-error";
import { formatMoney } from "@/lib/format/money";
import { creditSummary, usePaymentTerms } from "@/lib/payment-terms";
import { useSignedIn } from "@/lib/auth/use-signed-in";

/**
 * The customer's own credit position on the account page (SFCREDIT): limit, owed, left, the days to
 * pay and a warning while a receivable is overdue. A customer without credit sees nothing: there is
 * nothing to tell them, and the card would only raise a question.
 */
export function CreditCard() {
  const signedIn = useSignedIn();
  const query = usePaymentTerms(signedIn === true);
  const credit = query.data ? creditSummary(query.data) : undefined;

  if (query.isPending && signedIn === true) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-40 w-full rounded-[var(--r-lg)]" />
    );
  }
  if (query.error && !query.data) {
    return (
      <SurfaceCard className="space-y-3">
        <Heading />
        <div role="alert" className="space-y-3">
          <Alert tone="warning" title="Không tải được thông tin công nợ.">
            {describeApiError(query.error)}
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden className="mr-2 size-4" />
            Thử lại
          </Button>
        </div>
      </SurfaceCard>
    );
  }
  if (!credit) return null;

  const money = (amount: number) => formatMoney(amount, credit.currency);
  const usedPercent = Math.min(100, Math.round((credit.exposure / credit.limit) * 100));
  const rows = [
    { label: "Hạn mức", value: money(credit.limit) },
    { label: "Đang nợ", value: money(credit.exposure) },
    { label: "Còn lại", value: money(credit.available) },
  ];

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
            Các đơn công nợ mới sẽ chờ duyệt cho đến khi khoản quá hạn được thanh toán. Vui lòng
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
