"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert, Skeleton } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { MoneyFigures, type MoneyFigure } from "@/components/storefront/money-figures";
import { formatMoney } from "@/lib/format/money";
import { creditSummary, useMyCreditPosition, type CreditSummary } from "@/lib/credit-position";
import { formatDate } from "@/lib/format/date";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { isDueNow, useMyInstallments } from "@/lib/installments";

import type { ReactNode } from "react";

/** BE GET /installments/me (scope OWN). */
const INSTALLMENTS_PERMISSION = "payment-installments:READ";
/** The BE pages at most 200: one read covers a customer's installments (as on "Thanh toán", same cache). */
const INSTALLMENTS_PAGE_SIZE = 200;

type DueNow = { amount: number; count: number };

/**
 * The customer's own credit position on the account page (SFCREDIT; kltn-docs 15 §4.3, 18 §2), as
 * three figures (UI/UX 27/11, sf-03): what is due now (on-signing installments included), what the
 * installments paid after delivery still owe against the limit and what is left of it, and what is
 * overdue; then the days to pay and a warning while an installment is overdue. Read from GET
 * /orders/credit-position/me and GET /installments/me. Nothing is shown while the position is not
 * loaded. A customer with neither credit nor anything owed sees only the way to ask for credit (BE
 * PR #490, handoff A3): `requests`, the "Đề nghị cấp hạn mức" section the page passes in.
 */
export function CreditCard({ requests }: { requests?: ReactNode } = {}) {
  const signedIn = useSignedIn();
  const query = useMyCreditPosition(signedIn === true);
  const credit = query.data ? creditSummary(query.data) : undefined;
  const dueNow = useDueNow(signedIn === true);

  if (query.isPending && signedIn === true) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-40 w-full rounded-[var(--r-lg)]" />
    );
  }
  // Not loaded: whether credit matters to this customer is unknown, and a customer without credit
  // must not be shown a credit warning.
  if (!query.isSuccess) return null;
  if (!credit) {
    return (
      <SurfaceCard className="space-y-4">
        <Heading />
        <p className="text-ink-secondary text-sm">
          Bạn chưa có hạn mức công nợ: đơn hàng thanh toán trước khi giao.
        </p>
        {requests}
      </SurfaceCard>
    );
  }

  const money = (amount: number) => formatMoney(amount, credit.currency);
  const usedPercent =
    credit.limit > 0 ? Math.min(100, Math.round((credit.exposure / credit.limit) * 100)) : 0;

  return (
    <SurfaceCard className="space-y-4">
      <Heading />
      <MoneyFigures label="Công nợ của bạn" figures={creditFigures(credit, dueNow, money)} />
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
      {/* The on-signing installment is not in the exposure (15 BR-10): said, so "0 ₫" owed over an
          overdue on-signing installment does not read as a contradiction (UI/UX 27/11, sf-03). */}
      <p className="text-ink-tertiary text-xs">
        Dư nợ trả sau giao hàng gồm các đợt thanh toán sau giao hàng của hợp đồng đã ký chưa trả đủ
        (kể cả đợt chưa đến hạn) và phí huỷ đơn chưa thanh toán; con số này được so với hạn mức. Đợt
        thanh toán khi ký hợp đồng không nằm trong dư nợ
        {dueNow ? " mà nằm trong Cần thanh toán ngay" : ""}.
      </p>
      {credit.hasCredit && credit.limit <= 0 ? (
        <div role="status">
          <Alert tone="warning" title="Hạn mức công nợ của bạn là 0 ₫.">
            {/* 15 BR-11 (BE PR #486): the credit review comes before the contract is sent. Who
                reviews it is the shop's business, not the customer's. */}
            Đơn có đợt thanh toán sau giao hàng cần được duyệt công nợ trước khi hợp đồng được gửi
            cho bạn. Bạn có thể gửi đề nghị cấp hạn mức bên dưới.
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
            Hợp đồng mới sẽ được gửi sau khi khoản quá hạn được thanh toán.{" "}
            <Link
              href={STORE_ROUTES.account.payments}
              className="text-accent focus-visible:ring-accent rounded-[var(--r-sm)] font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Thanh toán ngay
            </Link>
          </Alert>
        </div>
      ) : null}
      {requests}
    </SurfaceCard>
  );
}

/** Due now (when known), owed after delivery against the limit, overdue. */
function creditFigures(
  credit: CreditSummary,
  dueNow: DueNow | undefined,
  money: (amount: number) => string,
): MoneyFigure[] {
  const owed: MoneyFigure = {
    label: "Dư nợ trả sau giao hàng",
    value: money(credit.exposure),
    note: !credit.hasCredit
      ? "Bạn chưa có hạn mức công nợ"
      : credit.limit > 0
        ? `Hạn mức ${money(credit.limit)} · còn dùng được ${money(credit.available)}`
        : `Hạn mức ${money(0)}`,
  };
  const overdue: MoneyFigure = {
    label: "Quá hạn",
    value: money(credit.overdueAmount),
    note:
      credit.overdueAmount > 0 && credit.oldestOverdueDueDate
        ? `Sớm nhất từ ${formatDate(credit.oldestOverdueDueDate)}`
        : credit.overdue
          ? undefined
          : "Không có khoản quá hạn",
    alert: credit.overdue,
  };
  if (!dueNow) return [owed, overdue];
  return [
    {
      label: "Cần thanh toán ngay",
      value: money(dueNow.amount),
      note:
        dueNow.count > 0
          ? `${dueNow.count} đợt, gồm cả đợt thanh toán khi ký hợp đồng`
          : "Không có đợt nào cần thanh toán",
    },
    owed,
    overdue,
  ];
}

/**
 * What is due now, on-signing installments included (`isDueNow`, the rule of the payments page):
 * read from the customer's installments, the same request as "Thanh toán". Undefined without the
 * permission or while they are read: the figure is then left out rather than shown as zero.
 */
function useDueNow(enabled: boolean): DueNow | undefined {
  const permissions = useMyPermissions();
  const allowed = useHasPermission(INSTALLMENTS_PERMISSION) && !permissions.isPending;
  const query = useMyInstallments({ page: 0, size: INSTALLMENTS_PAGE_SIZE }, enabled && allowed);
  if (!allowed || !query.data) return undefined;
  const owing = query.data.items.filter(isDueNow);
  return {
    amount: owing.reduce((sum, installment) => sum + installment.outstanding, 0),
    count: owing.length,
  };
}

function Heading() {
  return (
    <h2 id="credit-heading" className="font-display text-ink-primary text-base font-semibold">
      Công nợ
    </h2>
  );
}
