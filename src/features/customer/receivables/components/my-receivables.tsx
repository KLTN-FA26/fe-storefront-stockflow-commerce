"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ReceiptText, RefreshCw } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { cn } from "cn";

import { Alert, Skeleton } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { SurfaceCard } from "@/components/storefront/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";
import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { RECEIVABLE_KIND_LABEL, RECEIVABLE_STATUS_LABEL, RECEIVABLE_STATUS_TONE } from "../labels";
import { useMyReceivables } from "../queries";
import type { Receivable } from "../schemas";

/** The permission that lets a customer read what they owe (BE GET /receivables/me, scope OWN). */
export const RECEIVABLES_PERMISSION = "payment-receivables:READ";

const TONE_CLASSES = {
  positive: "bg-positive/10 text-positive",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-neutral/10 text-neutral",
  muted: "bg-bg-muted text-ink-secondary",
  special: "bg-special/10 text-special",
} as const;

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: false });

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <ReceiptText aria-hidden className="text-accent size-5" />
      <h2 className="font-display text-ink-primary text-lg font-bold">Công nợ của tôi</h2>
    </div>
  );
}

function Row({ receivable }: { receivable: Receivable }) {
  const money = (amount: number) => formatMoney(amount, receivable.currency);
  const overdue = receivable.status === "OVERDUE";
  const tone = RECEIVABLE_STATUS_TONE[receivable.status];
  return (
    <li
      data-overdue={overdue || undefined}
      className={cn(
        "space-y-2 rounded-[var(--r-md)] border p-3 text-sm sm:p-4",
        overdue ? "border-danger/40 bg-danger/5" : "border-border-default bg-bg-surface",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={STORE_ROUTES.account.orders.detail(receivable.orderId)}
          className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {RECEIVABLE_KIND_LABEL[receivable.kind ?? "UNKNOWN"]} · Xem đơn hàng
        </Link>
        <Badge className={cn("h-7 rounded-full px-3 font-semibold", TONE_CLASSES[tone])}>
          {RECEIVABLE_STATUS_LABEL[receivable.status]}
        </Badge>
      </div>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-4">
        <Cell label="Số tiền" value={money(receivable.amount)} />
        <Cell label="Đã thanh toán" value={money(receivable.paidAmount)} />
        <Cell label="Còn phải trả" value={money(receivable.outstanding)} strong={overdue} />
        <Cell
          label="Hạn thanh toán"
          value={receivable.dueDate ? formatDate(receivable.dueDate) : "Chưa có"}
          strong={overdue}
        />
      </dl>
    </li>
  );
}

function Cell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-secondary">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          strong ? "text-danger font-semibold" : "text-ink-primary font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * What the customer owes (kltn-docs 18 §2 "xem công nợ"): one row per receivable, earliest due first
 * as the BE sorts them, an overdue one highlighted. Shown only to an account holding
 * `payment-receivables:READ`; the BE re-checks on every call.
 */
export function MyReceivables() {
  const signedIn = useSignedIn();
  // Nothing is asked or shown until the permission list is known (or has failed, when the section is
  // offered like any other and the BE decides): a customer without the permission never sees it flash.
  const permissions = useMyPermissions();
  const allowed = useHasPermission(RECEIVABLES_PERMISSION) && !permissions.isPending;
  const [urlPage, setPage] = useQueryState("congno", pageParser);
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const query = useMyReceivables(page - 1, signedIn === true && allowed);
  const { data, isPlaceholderData } = query;

  // An out-of-range page in the URL comes back to a real one.
  useEffect(() => {
    if (urlPage !== page) void setPage(page, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setPage(Math.max(data.totalPages, 1), { history: "replace" });
    }
  }, [urlPage, page, data, isPlaceholderData, setPage]);

  if (!allowed) return null;

  return (
    <SurfaceCard className="space-y-4">
      <Heading />
      {query.isPending ? (
        <Skeleton
          role="status"
          aria-label="Đang tải"
          className="h-32 w-full rounded-[var(--r-md)]"
        />
      ) : query.error && !data ? (
        <div className="space-y-3" role="alert">
          <Alert tone="warning" title="Không tải được công nợ.">
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
      ) : data && data.items.length === 0 ? (
        <p className="text-ink-secondary text-sm">Bạn hiện không có khoản công nợ nào.</p>
      ) : data ? (
        <>
          <ul className="space-y-3">
            {data.items.map((receivable) => (
              <Row key={receivable.receivableId} receivable={receivable} />
            ))}
          </ul>
          <ListPagination
            label="Phân trang công nợ"
            page={data.page + 1}
            totalPages={data.totalPages}
            hasPrevious={data.hasPrevious}
            hasNext={data.hasNext}
            busy={query.isFetching}
            onPageChange={(next) => void setPage(next)}
          />
        </>
      ) : null}
    </SurfaceCard>
  );
}
