"use client";

import { useEffect } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { PageHeader, ScrollAfterItems } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { isQuoteStatusFilter, QUOTE_STATUS_FILTERS, QUOTE_STATUS_META } from "../lifecycle";
import { QUOTE_PAGE_SIZE, useMyQuotes } from "../queries";
import { QuoteRowCard } from "./quote-row-card";
import {
  NoQuotesForFilter,
  NoQuotesYet,
  QuoteListSkeleton,
  QuoteLoadError,
  QuoteStaleNotice,
} from "./quote-states";

const ALL = "ALL";
const urlState = {
  page: parseAsInteger.withDefault(1),
  status: parseAsStringLiteral(QUOTE_STATUS_FILTERS),
};

/** "Báo giá của tôi" (WF-02 D2): the quotes Sales sent, newest first, filtered by status in the URL. */
export function QuotesScreen() {
  const [{ page: urlPage, status }, setUrl] = useQueryStates(urlState, {
    history: "push",
    scroll: true,
  });
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const query = useMyQuotes({ page, size: QUOTE_PAGE_SIZE, status });
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = query;

  // An out-of-range URL page goes back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (urlPage !== page) void setUrl({ page }, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setUrl({ page: Math.max(data.totalPages, 1) }, { history: "replace" });
    }
  }, [urlPage, page, data, isPlaceholderData, setUrl]);

  // Changing the filter starts again at page 1 (state-persistence rules).
  const filter = (value: string) =>
    void setUrl({ status: isQuoteStatusFilter(value) ? value : null, page: 1 });

  return (
    <>
      <PageHeader title="Báo giá của tôi" subtitle="Báo giá Sale đã gửi cho bạn." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Select value={status ?? ALL} onValueChange={filter}>
          <SelectTrigger
            aria-label="Lọc theo trạng thái"
            className="border-border-default bg-bg-surface dark:bg-bg-surface text-ink-primary min-h-11 w-full rounded-[var(--r-md)] sm:w-56"
          >
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {QUOTE_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {QUOTE_STATUS_META[value].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-4">
        {isPending ? (
          <QuoteListSkeleton />
        ) : error && !data ? (
          <div className="space-y-3">
            <QuoteLoadError
              title="Không tải được danh sách báo giá"
              error={error}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
            {page > 1 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-[var(--r-md)] px-4"
                onClick={() => void setUrl({ page: 1 })}
              >
                Về trang đầu
              </Button>
            )}
          </div>
        ) : !data || data.totalElements === 0 ? (
          status ? (
            <NoQuotesForFilter onClear={() => void setUrl({ status: null, page: 1 })} />
          ) : (
            <NoQuotesYet />
          )
        ) : (
          <>
            {error && (
              <QuoteStaleNotice
                error={error}
                onRetry={() => void refetch()}
                retrying={isFetching}
              />
            )}
            <ScrollAfterItems visibleItems={4} label="Danh sách báo giá">
              <ul className="space-y-3" aria-busy={isPlaceholderData}>
                {data.items.map((quote) => (
                  <li key={quote.id}>
                    <QuoteRowCard quote={quote} />
                  </li>
                ))}
              </ul>
            </ScrollAfterItems>
            <ListPagination
              label="Phân trang báo giá"
              page={data.page}
              totalPages={data.totalPages}
              hasPrevious={data.hasPrevious}
              hasNext={data.hasNext}
              busy={isPlaceholderData}
              onPageChange={(next) => void setUrl({ page: next })}
            />
          </>
        )}
      </div>
    </>
  );
}
