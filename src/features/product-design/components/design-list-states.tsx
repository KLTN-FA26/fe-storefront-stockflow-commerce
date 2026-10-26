"use client";

import Link from "next/link";
import { MessageCircle, RefreshCw } from "lucide-react";

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

/** While a customer cannot start a design (P1 not shipped), Sales designs for them. */
export const SALES_DESIGNS_FOR_YOU =
  "Sales của StockFlow lên thiết kế theo yêu cầu của bạn. Nhắn Sales sản phẩm và logo bạn muốn in; bản thiết kế sẽ hiện trong “Thiết kế của tôi” để bạn xem và xác nhận.";

/** "Nhắn Sales" (the Sales chat) and a way back, for the states that send a design request to Sales. */
export function AskSalesActions({ back }: { back: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
        <Link href={STORE_ROUTES.chat.list}>
          <MessageCircle aria-hidden className="size-4" />
          Nhắn Sales
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
        <Link href={back.href}>{back.label}</Link>
      </Button>
    </div>
  );
}

/**
 * The customer has no design yet: with `selfService` they start one from a product; without it
 * (the BE has no P1) Sales designs for them, so the way in is the Sales chat.
 */
export function NoDesignsYet({ selfService }: { selfService: boolean }) {
  if (!selfService) {
    return (
      <EmptyState
        title="Bạn chưa có thiết kế nào"
        description={SALES_DESIGNS_FOR_YOU}
        action={
          <AskSalesActions back={{ href: STORE_ROUTES.catalog.list, label: "Xem sản phẩm" }} />
        }
      />
    );
  }
  return (
    <EmptyState
      title="Bạn chưa có thiết kế nào"
      description="Chọn một sản phẩm in được và bấm “Bắt đầu thiết kế” để tạo bản thiết kế đầu tiên."
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
          Xem tất cả thiết kế
        </Button>
      }
    />
  );
}
