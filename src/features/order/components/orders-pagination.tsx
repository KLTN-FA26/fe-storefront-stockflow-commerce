"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface OrdersPaginationProps {
  page: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  busy: boolean;
  onPageChange: (page: number) => void;
}

/** Prev/next driven by the BE hasPrevious/hasNext flags (never recomputed client-side). */
export function OrdersPagination({
  page,
  totalPages,
  hasPrevious,
  hasNext,
  busy,
  onPageChange,
}: OrdersPaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Phân trang đơn hàng" className="flex items-center justify-between gap-3">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-full px-4"
        disabled={!hasPrevious || busy}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft aria-hidden className="mr-1 size-4" />
        Trước
      </Button>
      <p className="text-ink-secondary text-sm tabular-nums" aria-live="polite">
        Trang {page} / {totalPages}
      </p>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-full px-4"
        disabled={!hasNext || busy}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        Sau
        <ChevronRight aria-hidden className="ml-1 size-4" />
      </Button>
    </nav>
  );
}
