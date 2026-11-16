"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeProjectError } from "../errors";
import { RetryButton } from "./design-list-states";

export function ProjectSkeleton() {
  return (
    <div role="status" aria-label="Đang tải dự án" className="space-y-6">
      <Skeleton className="h-24 w-full rounded-[var(--r-lg)]" />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-80 w-full rounded-[var(--r-lg)]" />
        ))}
      </div>
    </div>
  );
}

/** 404: the project is not there (or is not the customer's). */
export function ProjectNotFound() {
  return (
    <EmptyState
      title="Không tìm thấy dự án"
      description="Dự án này không tồn tại, hoặc bạn không có quyền xem nó."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.design.projects}>Về danh sách dự án</Link>
        </Button>
      }
    />
  );
}

/** 5xx or the network: say so, and offer the retry. */
export function ProjectReadError({
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
      <Alert tone="danger" title="Không tải được dự án">
        {describeProjectError(error)}
      </Alert>
      <RetryButton onRetry={onRetry} retrying={retrying} />
    </div>
  );
}
