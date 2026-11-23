"use client";

import Link from "next/link";
import {
  ChevronRight,
  FileSignature,
  FileText,
  Landmark,
  ListChecks,
  RotateCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Skeleton } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { formatNumber } from "@/lib/format";

import type { TodoCount } from "../api";
import { useContractsToSign, useInstallmentsToPay, useQuotesToAnswer } from "../queries";

/** BE GET /installments/me (scope OWN); the same code the installment list checks. */
const INSTALLMENTS_READ = "payment-installments:READ";

type TodoRow = { key: string; icon: LucideIcon; text: string; href: string };

/** One document opens itself; several open their list (the quotes list filtered to SENT). */
const quoteRow = ({ total, first }: TodoCount): TodoRow | null =>
  total === 0
    ? null
    : {
        key: "quotes",
        icon: FileText,
        text: `${formatNumber(total)} báo giá chờ bạn phản hồi`,
        href:
          total === 1 && first[0]
            ? STORE_ROUTES.account.quotes.detail(first[0].id)
            : `${STORE_ROUTES.account.quotes.list}?status=SENT`,
      };

const contractRow = ({ total, first }: TodoCount): TodoRow | null =>
  total === 0
    ? null
    : {
        key: "contracts",
        icon: FileSignature,
        text: `${formatNumber(total)} hợp đồng chờ bạn ký`,
        href:
          total === 1 && first[0]
            ? STORE_ROUTES.account.orders.detail(first[0].id)
            : STORE_ROUTES.account.orders.list,
      };

const installmentRow = ({ due, overdue }: { due: number; overdue: number }): TodoRow | null =>
  due === 0
    ? null
    : {
        key: "installments",
        icon: Landmark,
        text: `${formatNumber(due)} đợt thanh toán đến hạn${overdue > 0 ? `, ${formatNumber(overdue)} quá hạn` : ""}`,
        href: STORE_ROUTES.account.payments,
      };

/**
 * "Việc cần làm" on the account home (SF-UX-39): what waits for the customer now, each a link to
 * where it is done — quotes to answer, contracts to sign, installments due or overdue. Each source is
 * read only with its permission (the BE re-checks); nothing shows until the permissions are known.
 */
export function AccountTodo() {
  const signedIn = useSignedIn() === true;
  const permissions = useMyPermissions();
  const known = signedIn && !permissions.isPending;
  const canQuotes = useHasPermission(PERM.quotesRead) && known;
  const canOrders = useHasPermission(PERM.ordersRead) && known;
  const canInstallments = useHasPermission(INSTALLMENTS_READ) && known;
  const quotes = useQuotesToAnswer(canQuotes);
  const contracts = useContractsToSign(canOrders);
  const installments = useInstallmentsToPay(canInstallments);

  if (!known || !(canQuotes || canOrders || canInstallments)) return null;

  const sources = [
    { on: canQuotes, query: quotes },
    { on: canOrders, query: contracts },
    { on: canInstallments, query: installments },
  ].filter((source) => source.on);
  const pending = sources.some((source) => source.query.isPending && !source.query.isError);
  const failed = sources.filter((source) => source.query.isError);
  const rows = [
    canQuotes && quotes.data ? quoteRow(quotes.data) : null,
    canOrders && contracts.data ? contractRow(contracts.data) : null,
    canInstallments && installments.data ? installmentRow(installments.data) : null,
  ].filter((row): row is TodoRow => row !== null);

  return (
    <SurfaceCard as="section" className="space-y-3">
      <div className="flex items-center gap-2">
        <ListChecks aria-hidden className="text-accent size-5" />
        <h2 className="font-display text-ink-primary text-lg font-bold">Việc cần làm</h2>
      </div>
      {pending ? (
        <Skeleton role="status" aria-label="Đang tải việc cần làm" className="h-12 w-full" />
      ) : rows.length > 0 ? (
        <ul className="grid gap-2">
          {rows.map(({ key, icon: Icon, text, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="border-border-default hover:bg-bg-muted focus-visible:ring-accent flex min-h-11 items-center gap-3 rounded-[var(--r-md)] border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <Icon aria-hidden className="text-accent size-5 shrink-0" />
                <span className="text-ink-primary min-w-0 flex-1 font-medium tabular-nums">
                  {text}
                </span>
                <ChevronRight aria-hidden className="text-ink-tertiary size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : failed.length === 0 ? (
        <p className="text-ink-secondary text-sm">Không có việc nào cần bạn làm lúc này.</p>
      ) : null}
      {!pending && failed.length > 0 ? (
        <div className="text-ink-secondary flex flex-wrap items-center gap-2 text-sm">
          <span>Chưa tải được một phần việc cần làm.</span>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 rounded-[var(--r-md)] px-3"
            disabled={failed.some((source) => source.query.isFetching)}
            onClick={() => failed.forEach((source) => void source.query.refetch())}
          >
            <RotateCw aria-hidden className="size-4" />
            Thử lại
          </Button>
        </div>
      ) : null}
    </SurfaceCard>
  );
}
