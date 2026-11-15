"use client";

import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeDesignError } from "../errors";
import { RetryButton } from "./design-list-states";

export function ProjectListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải danh sách dự án"
      className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-72 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

export function ProjectLoadError({
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
      <Alert tone="danger" title="Không tải được danh sách dự án">
        {describeDesignError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}

/** The customer has no project at all: what one is for, and a way to make the first. */
export function NoProjectsYet({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      title="Bạn chưa có dự án nào"
      description="Dự án gom các bản thiết kế của một bộ sản phẩm, dùng chung ảnh và mẫu chữ, rồi gửi duyệt cả bộ cùng lúc."
      action={
        <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-5" onClick={onCreate}>
          Tạo dự án
        </Button>
      }
    />
  );
}

/** The Đã đóng tab has nothing in it (the customer may still have active projects). */
export function NoClosedProjects({ onShowActive }: { onShowActive: () => void }) {
  return (
    <EmptyState
      title="Chưa có dự án nào đã đóng"
      description="Dự án bạn đóng sẽ nằm ở đây, chỉ để xem lại."
      action={
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-5"
          onClick={onShowActive}
        >
          Xem dự án đang dùng
        </Button>
      }
    />
  );
}
