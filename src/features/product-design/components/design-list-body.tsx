"use client";

import { ListPagination } from "@/components/storefront/list-pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import type { useDesignList } from "../queries";
import type { Design } from "../types";
import { DesignCard } from "./design-card";
import { COLOR_DISCLAIMER } from "./color-disclaimer";
import type { DesignRevision } from "./design-list-revision";
import {
  DesignListSkeleton,
  DesignLoadError,
  DesignWaitingNotice,
  NoDesignsInTab,
  NoDesignsYet,
} from "./design-list-states";

type DesignListBodyProps = {
  list: ReturnType<typeof useDesignList>;
  /** "Tất cả" is shown: an empty list means the customer has no design yet, not an empty tab. */
  allTab: boolean;
  page: number;
  revision: DesignRevision;
  onDelete: (design: Design) => void;
  onClone: (design: Design) => void;
  onShowAll: () => void;
  onFirstPage: () => void;
  onPageChange: (page: number) => void;
};

/** The tab's content: loading, failed, empty, or the cards of the page with the pagination. */
export function DesignListBody({
  list,
  allTab,
  page,
  revision,
  onDelete,
  onClone,
  onShowAll,
  onFirstPage,
  onPageChange,
}: DesignListBodyProps) {
  const { data, isPending, isPaused, isFetching, isPlaceholderData, error, refetch } = list;
  // A kept-previous page with nothing in it is the other tab's answer: do not show it as this tab's.
  if (isPending || (isPlaceholderData && data?.totalElements === 0)) {
    return (
      <div className="space-y-4">
        {isPaused && <DesignWaitingNotice />}
        <DesignListSkeleton />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="space-y-3">
        <DesignLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />
        {page > 1 && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={onFirstPage}
          >
            Về trang đầu
          </Button>
        )}
      </div>
    );
  }
  if (!data || data.totalElements === 0) {
    return allTab ? <NoDesignsYet /> : <NoDesignsInTab onShowAll={onShowAll} />;
  }
  return (
    <>
      <p className="text-ink-tertiary mb-3 text-xs">{COLOR_DISCLAIMER}</p>
      <ul
        aria-label="Danh sách thiết kế"
        aria-busy={isPlaceholderData}
        className={cn(
          "grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3",
          isPlaceholderData && "opacity-60",
        )}
      >
        {data.items.map((design) => (
          <li key={design.id}>
            <DesignCard
              design={design}
              onDelete={onDelete}
              onRevise={revision.revise}
              onClone={onClone}
              revising={revision.revisingId === design.id}
              reviseDisabled={revision.busy}
            />
          </li>
        ))}
      </ul>
      <ListPagination
        label="Phân trang thiết kế"
        page={data.page}
        totalPages={data.totalPages}
        hasPrevious={data.hasPrevious}
        hasNext={data.hasNext}
        busy={isPlaceholderData}
        onPageChange={onPageChange}
      />
    </>
  );
}
