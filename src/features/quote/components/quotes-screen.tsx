"use client";

import { useEffect } from "react";
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";

import { PageHeader } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";
import { FilterPill } from "@/components/storefront/filter-pill";

import { QUOTE_STATUS_FILTERS } from "../lifecycle";
import { QUOTE_PAGE_SIZE, useMyQuotes } from "../queries";
import type { QuoteStatusFilter } from "../types";
import { QuoteRowCard } from "./quote-row-card";
import {
  NoQuotesForFilter,
  NoQuotesYet,
  QuoteListSkeleton,
  QuoteLoadError,
  QuoteStaleNotice,
} from "./quote-states";

/** "Cần phản hồi" is the quotes waiting on the customer: sent, not yet accepted or sent back for changes. */
const NEEDS_REPLY: QuoteStatusFilter = "SENT";
const urlState = {
  page: parseAsInteger.withDefault(1),
  status: parseAsStringLiteral(QUOTE_STATUS_FILTERS),
};

/** "Báo giá của tôi" (WF-02 D2): the quotes Sale sent, newest first, all or the ones waiting on the customer (`?status=SENT`), as the orders list does (S04-9). */
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
  const filter = (value: QuoteStatusFilter | null) => void setUrl({ status: value, page: 1 });

  return (
    <>
      <PageHeader titleHidden title="Báo giá của tôi" subtitle="Báo giá Sale đã gửi cho bạn." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Lọc báo giá" className="flex flex-wrap gap-2">
          <FilterPill
            active={status === null}
            aria-pressed={status === null}
            onClick={() => filter(null)}
          >
            Tất cả
          </FilterPill>
          <FilterPill
            active={status === NEEDS_REPLY}
            aria-pressed={status === NEEDS_REPLY}
            onClick={() => filter(NEEDS_REPLY)}
          >
            Cần phản hồi
          </FilterPill>
        </div>
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
            {/* The list runs at full length in the page column: one scrollbar, not a box scrolling
                inside the page (UI/UX 27/11, sf-04). */}
            <ul className="space-y-3" aria-busy={isPlaceholderData}>
              {data.items.map((quote) => (
                <li key={quote.id}>
                  <QuoteRowCard quote={quote} />
                </li>
              ))}
            </ul>
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
