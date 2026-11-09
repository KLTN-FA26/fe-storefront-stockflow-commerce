"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeDesignError } from "../errors";

export function DesignListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải danh sách thiết kế"
      className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-80 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

/** React Query pauses a fetch while offline: still pending, no data, no error. Say why it waits. */
export function DesignWaitingNotice() {
  return (
    <Alert tone="info" title="Đang chờ kết nối">
      Danh sách sẽ tự tải lại khi có mạng hoặc khi bạn quay lại trang này.
    </Alert>
  );
}

export function RetryButton({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 rounded-[var(--r-md)] px-4"
      onClick={onRetry}
      disabled={retrying}
    >
      <RefreshCw aria-hidden className="mr-2 size-4" />
      {retrying ? "Đang thử lại..." : "Thử lại"}
    </Button>
  );
}

export function DesignLoadError({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div className="space-y-3">
      <Alert tone="danger" title="Không tải được danh sách thiết kế">
        {describeDesignError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** The customer has no design yet: a way to a product they can print on. */
export function NoDesignsYet() {
  return (
    <EmptyState
      title="Bạn chưa có thiết kế nào"
      description="Chọn một sản phẩm in được và bấm “Thiết kế” để tạo bản thiết kế đầu tiên."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm</Link>
        </Button>
      }
    />
  );
}

/** The customer has designs, but none in the tab they are looking at. */
export function NoDesignsInTab({ onShowAll }: { onShowAll: () => void }) {
  return (
    <EmptyState
      title="Không có thiết kế ở mục này"
      description="Thử chọn mục khác để xem các thiết kế còn lại."
      action={
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          onClick={onShowAll}
        >
          Xem tất cả
        </Button>
      }
    />
  );
}
