"use client";

import { RefreshCw } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/error";

import { describeError } from "../errors";

export function AddressListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải sổ địa chỉ" className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-44 w-full rounded-[var(--r-lg)]" />
        ))}
      </div>
    </div>
  );
}

export function AddressFormSkeleton() {
  return (
    <div role="status" aria-label="Đang tải địa chỉ" className="space-y-4">
      <Skeleton className="h-24 w-full rounded-[var(--r-lg)]" />
      <Skeleton className="h-96 w-full rounded-[var(--r-lg)]" />
    </div>
  );
}

function RetryButton({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 rounded-[var(--r-md)] px-4"
      onClick={onRetry}
      disabled={retrying}
    >
      <RefreshCw aria-hidden className="mr-2 size-4" />
      {retrying ? "Đang thử lại..." : "Thử lại"}
    </Button>
  );
}

/** Query failure: distinguishes "no customer profile" from network/4xx/5xx/contract errors. */
export function AddressLoadError({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (error instanceof ApiError && error.code === "CUSTOMER_NOT_FOUND") {
    return (
      <Alert tone="warning" title="Chưa có hồ sơ khách hàng">
        Tài khoản đăng nhập chưa được liên kết với hồ sơ khách hàng nên chưa thể dùng sổ địa chỉ.
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <Alert tone="danger" title="Không tải được sổ địa chỉ">
        {describeError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** A background refetch failed while older data is still on screen. */
export function AddressStaleNotice({
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
      <Alert tone="warning" title="Chưa cập nhật được sổ địa chỉ">
        Đang hiển thị dữ liệu đã tải trước đó. {describeError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}
