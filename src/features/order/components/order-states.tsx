"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeError, isApiError } from "../errors";

export function OrderListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách đơn hàng" className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-48 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div role="status" aria-label="Đang tải đơn hàng" className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-40 w-full rounded-[var(--r-lg)]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Skeleton className="h-64 w-full rounded-[var(--r-lg)]" />
        <Skeleton className="h-64 w-full rounded-[var(--r-lg)]" />
      </div>
    </div>
  );
}

/**
 * React Query pauses a fetch or its retries while the device is offline or the tab is hidden.
 * The query is still pending (no data, no error), so say why it is waiting instead of guessing.
 */
export function OrderWaitingNotice() {
  return (
    <Alert tone="info" title="Đang chờ kết nối">
      Đơn hàng sẽ tự tải lại khi có mạng hoặc khi bạn quay lại trang này.
    </Alert>
  );
}

function RetryButton({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 rounded-full px-4"
      onClick={onRetry}
      disabled={retrying}
    >
      <RefreshCw aria-hidden className="mr-2 size-4" />
      {retrying ? "Đang thử lại..." : "Thử lại"}
    </Button>
  );
}

/** Query failure: separates "no customer profile" from network/4xx/5xx/contract errors. */
export function OrderLoadError({
  title,
  error,
  onRetry,
  retrying,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (isApiError(error) && error.code === "CUSTOMER_NOT_FOUND") {
    return (
      <Alert tone="warning" title="Chưa có hồ sơ khách hàng">
        Tài khoản đăng nhập chưa được liên kết với hồ sơ khách hàng nên chưa thể xem đơn hàng.
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <Alert tone="danger" title={title}>
        {describeError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** A background refetch failed while earlier data is still on screen: keep it, but say so. */
export function OrderStaleNotice({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  // role="status": it appears after the page has rendered, so screen readers need it announced.
  return (
    <div role="status" className="space-y-3">
      <Alert tone="warning" title="Chưa cập nhật được dữ liệu mới nhất">
        Đang hiển thị dữ liệu đã tải trước đó. {describeError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

export function NoOrdersYet() {
  return (
    <EmptyState
      title="Bạn chưa có đơn hàng nào"
      description="Khi bạn đặt hàng lần đầu, lịch sử đơn hàng sẽ xuất hiện tại đây."
      action={
        <Button asChild className="min-h-11 rounded-full px-5">
          <Link href={STORE_ROUTES.catalog.list}>Tiếp tục mua sắm</Link>
        </Button>
      }
    />
  );
}
