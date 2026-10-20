"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeCatalogError } from "../errors";

export function CatalogGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Đang tải sản phẩm"
      className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="aspect-[4/5] w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

/** The catalogue is behind a login: no price or stock for a visitor (kltn-docs 13 BR-02). */
export function SignInRequired() {
  return (
    <EmptyState
      title="Đăng nhập để xem sản phẩm"
      description="Cổng khách hàng chỉ dành cho khách sỉ đã được cấp tài khoản. Đăng nhập để xem sản phẩm, giá riêng và tình trạng còn hàng."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={APP_ROUTES.login}>Đăng nhập</Link>
        </Button>
      }
    />
  );
}

export function CatalogLoadError({
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
  return (
    <div className="space-y-3">
      <Alert tone="danger" title={title}>
        {describeCatalogError(error)}
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

/** Products came back but the stock/price figures did not: say so instead of showing blanks. */
export function FiguresNotice({ error }: { error: unknown }) {
  return (
    <div role="status">
      <Alert tone="warning" title="Chưa hiển thị được giá và tồn kho.">
        {describeCatalogError(error)}
      </Alert>
    </div>
  );
}

/** /search without a text: nothing is asked, the visitor is told what the box accepts. */
export function SearchPrompt() {
  return (
    <EmptyState
      title="Nhập từ khoá để tìm sản phẩm"
      description="Tìm theo tên hoặc mã SKU, gõ có dấu hay không dấu đều được."
      action={
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.catalog.list}>Xem tất cả sản phẩm</Link>
        </Button>
      }
    />
  );
}

export function NoProducts({ query, onClear }: { query: string | undefined; onClear: () => void }) {
  if (query) {
    return (
      <EmptyState
        title="Không tìm thấy sản phẩm phù hợp"
        description={`Không có sản phẩm nào khớp với “${query}”. Thử từ khoá khác hoặc xem toàn bộ danh mục.`}
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-5"
            onClick={onClear}
          >
            Xoá tìm kiếm
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      title="Chưa có sản phẩm nào"
      description="Danh mục đang được cập nhật. Vui lòng quay lại sau hoặc chat với chúng tôi."
      action={
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.chat.list}>Chat với CSKH</Link>
        </Button>
      }
    />
  );
}
