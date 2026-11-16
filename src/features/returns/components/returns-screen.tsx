"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";

import { STORE_ROUTES } from "@/constants";
import { PageHeader } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { formatDate } from "@/lib/format/date";
import {
  RETURN_REASON_LABEL,
  RETURN_STATUS_META,
  useMyReturns,
  type ReturnRow,
} from "@/lib/returns";

import { NoReturnsYet, ReturnListSkeleton, ReturnLoadError } from "./return-states";

const PAGE_SIZE = 10;
/** Tab trạng thái → các `status` gửi BE (lặp tham số). */
const TABS = {
  all: { label: "Tất cả", statuses: undefined },
  open: {
    label: "Đang xử lý",
    statuses: ["REQUESTED", "AWAITING_RETURN", "RECEIVED", "SETTLEMENT_PENDING"] as const,
  },
  closed: { label: "Đã đóng", statuses: ["RESOLVED", "REJECTED", "CANCELLED", "EXPIRED"] as const },
} as const;
type Tab = keyof typeof TABS;
const TAB_KEYS = Object.keys(TABS) as Tab[];

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true });
const tabParser = parseAsStringLiteral(TAB_KEYS).withDefault("all");

function ReturnRowCard({ row }: { row: ReturnRow }) {
  const meta = RETURN_STATUS_META[row.status];
  return (
    <Link
      href={STORE_ROUTES.account.returns.detail(row.id)}
      className="border-border-default bg-bg-surface focus-visible:ring-accent flex items-center gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)] transition-shadow hover:shadow-[var(--sh-md)] focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-primary font-mono text-sm font-semibold">{row.rmaNumber}</span>
          <ToneBadge label={meta.label} tone={meta.tone} size="sm" />
        </div>
        <p className="text-ink-secondary text-sm">
          Đơn <span className="font-mono">{row.orderNumber ?? "—"}</span> ·{" "}
          {RETURN_REASON_LABEL[row.reasonCode]}
        </p>
        <p className="text-ink-tertiary text-xs tabular-nums">
          Gửi ngày {formatDate(row.requestedAt)}
          {row.status === "AWAITING_RETURN" && row.returnDeadline
            ? ` · Gửi hàng về trước ${formatDate(row.returnDeadline)}`
            : ""}
        </p>
      </div>
      <ChevronRight aria-hidden className="text-ink-tertiary size-5 shrink-0" />
    </Link>
  );
}

export function ReturnsScreen() {
  const [urlPage, setPage] = useQueryState("page", pageParser);
  const [tab, setTab] = useQueryState("tab", tabParser);
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const statuses = TABS[tab].statuses;
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useMyReturns({
    page,
    size: PAGE_SIZE,
    ...(statuses ? { status: statuses } : {}),
  });

  useEffect(() => {
    if (urlPage !== page) void setPage(page, { history: "replace" });
  }, [urlPage, page, setPage]);

  return (
    <>
      <PageHeader
        title="Trả hàng"
        subtitle="Theo dõi yêu cầu trả hàng, hạn gửi hàng về và tiền hoàn."
      />
      <div role="tablist" aria-label="Lọc theo trạng thái" className="mt-5 flex flex-wrap gap-2">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => void Promise.all([setTab(key), setPage(1)])}
            className={
              tab === key
                ? "border-accent bg-accent text-ink-inverse focus-visible:ring-accent min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
                : "border-border-default bg-bg-surface text-ink-secondary hover:text-ink-primary focus-visible:ring-accent min-h-11 rounded-full border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            }
          >
            {TABS[key].label}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-4">
        {isPending ? (
          <ReturnListSkeleton />
        ) : error && !data ? (
          <ReturnLoadError
            title="Không tải được yêu cầu trả hàng"
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        ) : !data || data.totalElements === 0 ? (
          <NoReturnsYet filtered={tab !== "all"} />
        ) : (
          <>
            <ul className="space-y-3" aria-busy={isPlaceholderData}>
              {data.items.map((row) => (
                <li key={row.id}>
                  <ReturnRowCard row={row} />
                </li>
              ))}
            </ul>
            <ListPagination
              label="Phân trang yêu cầu trả hàng"
              page={data.page}
              totalPages={data.totalPages}
              hasPrevious={data.hasPrevious}
              hasNext={data.hasNext}
              busy={isPlaceholderData}
              onPageChange={(next) => void setPage(next)}
            />
          </>
        )}
      </div>
    </>
  );
}
