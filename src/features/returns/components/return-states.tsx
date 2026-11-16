"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { hasErrorCode } from "@/lib/api/describe-error";
import { describeReturnError } from "@/lib/returns";

export function ReturnListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải yêu cầu trả hàng" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

export function ReturnDetailSkeleton() {
  return (
    <div role="status" aria-label="Đang tải yêu cầu trả hàng" className="space-y-5">
      <Skeleton className="h-8 w-full max-w-72" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Skeleton className="h-64 w-full rounded-[var(--r-lg)]" />
        <Skeleton className="h-40 w-full rounded-[var(--r-lg)]" />
      </div>
    </div>
  );
}

/** Lỗi khi tải: tách "chưa có hồ sơ khách hàng" khỏi lỗi mạng / 4xx / 5xx / sai hợp đồng. */
export function ReturnLoadError({
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
  if (hasErrorCode(error, "CUSTOMER_NOT_FOUND")) {
    return (
      <Alert tone="warning" title="Chưa có hồ sơ khách hàng">
        Tài khoản đăng nhập chưa được liên kết với hồ sơ khách hàng nên chưa thể xem trả hàng.
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <Alert tone="danger" title={title}>
        {describeReturnError(error)}
      </Alert>
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
    </div>
  );
}

export function NoReturnsYet({ filtered }: { filtered: boolean }) {
  return filtered ? (
    <EmptyState
      title="Không có yêu cầu nào ở trạng thái này"
      description="Chọn trạng thái khác để xem các yêu cầu trả hàng còn lại."
    />
  ) : (
    <EmptyState
      title="Bạn chưa có yêu cầu trả hàng nào"
      description="Nếu hàng nhận được bị lỗi, mở đơn đã giao và chọn “Yêu cầu trả hàng” trong 7 ngày kể từ ngày giao."
      action={
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.account.orders.list}>Xem đơn hàng</Link>
        </Button>
      }
    />
  );
}
