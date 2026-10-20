"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CATALOG_RESULT_WINDOW } from "../schemas";
import type { CatalogSort } from "../sorts";
import { sortOptions } from "../sorts";

interface CatalogToolbarProps {
  total: number | undefined;
  query: string | undefined;
  sort: CatalogSort;
  onSortChange: (sort: CatalogSort) => void;
  onClearQuery: () => void;
}

/** The BE stops counting at its window: say "500+" and how to see the rest, not an exact 500. */
function WindowNote({ query }: { query: string | undefined }) {
  return (
    <p className="text-ink-tertiary text-xs">
      {query
        ? `Chỉ hiện ${CATALOG_RESULT_WINDOW} kết quả khớp nhất — thêm từ khoá để thu hẹp.`
        : `Chỉ hiện ${CATALOG_RESULT_WINDOW} sản phẩm mới nhất — tìm theo tên hoặc SKU để xem thêm.`}
    </p>
  );
}

export function CatalogToolbar({
  total,
  query,
  sort,
  onSortChange,
  onClearQuery,
}: CatalogToolbarProps) {
  const capped = typeof total === "number" && total >= CATALOG_RESULT_WINDOW;
  return (
    <div className="bg-bg-base border-border-default sticky top-[var(--header-h)] z-30 -mx-4 flex flex-col gap-2 border-b px-4 py-3 sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-0 lg:pt-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-ink-secondary text-sm" role="status" aria-live="polite">
          {typeof total === "number" ? (
            <>
              <span className="text-ink-primary font-semibold tabular-nums">
                {capped ? `${CATALOG_RESULT_WINDOW}+` : total}
              </span>{" "}
              sản phẩm{query ? " phù hợp" : ""}
            </>
          ) : (
            "Đang tải…"
          )}
        </p>
        {query ? (
          <p className="text-ink-secondary flex min-w-0 items-center gap-1 text-sm">
            <span className="truncate">
              Từ khoá: <span className="text-ink-primary font-medium">{query}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 rounded-[var(--r-md)] px-2 text-sm"
              onClick={onClearQuery}
            >
              Xoá
            </Button>
          </p>
        ) : null}
        {capped ? <WindowNote query={query} /> : null}
      </div>
      <Select value={sort} onValueChange={(value) => onSortChange(value as CatalogSort)}>
        <SelectTrigger
          aria-label="Sắp xếp"
          className="border-border-default bg-bg-surface dark:bg-bg-surface dark:hover:bg-bg-muted text-ink-primary min-h-11 rounded-[var(--r-md)] lg:w-48"
        >
          <SelectValue placeholder="Sắp xếp" />
        </SelectTrigger>
        <SelectContent>
          {sortOptions(Boolean(query)).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
