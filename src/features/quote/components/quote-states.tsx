"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { Button } from "@/components/ui/button";

import { describeQuoteError, isApiError } from "../errors";
import { QUOTE_STATUS_META } from "../lifecycle";
import type { QuoteStatus } from "../types";

export function QuoteStatusBadge({ status, size }: { status: QuoteStatus; size?: "sm" | "md" }) {
  const { label, tone } = QUOTE_STATUS_META[status];
  return <ToneBadge label={label} tone={tone} {...(size ? { size } : {})} />;
}

export function QuoteListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách báo giá" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-32 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

export function QuoteDetailSkeleton() {
  return (
    <div role="status" aria-label="Đang tải báo giá" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8 w-full max-w-72" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <Skeleton className="h-72 w-full rounded-[var(--r-lg)]" />
        <Skeleton className="h-56 w-full rounded-[var(--r-lg)]" />
      </div>
    </div>
  );
}

function RetryButton({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
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

/** A query failed with nothing on screen: no customer profile, or a 4xx/5xx/network/contract error. */
export function QuoteLoadError({
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
        Tài khoản đăng nhập chưa được liên kết với hồ sơ khách hàng nên chưa thể xem báo giá.
      </Alert>
    );
  }
  return (
    <div className="space-y-3">
      <Alert tone="danger" title={title}>
        {describeQuoteError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** A background refetch failed while earlier data is still shown: keep it, but say so. */
export function QuoteStaleNotice({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="status" className="space-y-3">
      <Alert tone="warning" title="Chưa cập nhật được dữ liệu mới nhất">
        Đang hiển thị dữ liệu đã tải trước đó. {describeQuoteError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** No quote at all yet: quotes come from a quote request on an approved design, or from chat. */
export function NoQuotesYet() {
  return (
    <EmptyState
      title="Bạn chưa có báo giá nào"
      description="Gửi yêu cầu báo giá từ một thiết kế đã duyệt, hoặc chat với Sale. Báo giá Sale gửi sẽ hiện tại đây."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.design.list}>Xem thiết kế của tôi</Link>
        </Button>
      }
    />
  );
}

/** Quotes exist, but none with the chosen status. */
export function NoQuotesForFilter({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="Không có báo giá nào ở trạng thái này"
      description="Chọn trạng thái khác hoặc xem tất cả báo giá."
      action={
        <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-5" onClick={onClear}>
          Xem tất cả báo giá
        </Button>
      }
    />
  );
}
