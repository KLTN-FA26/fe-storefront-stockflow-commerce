"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { describeBeRefusal } from "@/lib/api/describe-error";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { CHAT_MESSAGE_BY_CODE } from "../labels";

export function ConversationListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải cuộc trò chuyện" className="space-y-3">
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-20 w-full rounded-[var(--r-lg)]" />
      ))}
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div
      role="status"
      aria-label="Đang tải cuộc trò chuyện"
      className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6"
    >
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-80 w-full rounded-[var(--r-lg)]" />
      <Skeleton className="h-14 w-full rounded-[var(--r-lg)]" />
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div role="status" aria-label="Đang tải tin nhắn" className="space-y-3">
      <Skeleton className="h-14 w-3/4" />
      <Skeleton className="ml-auto h-12 w-1/2" />
      <Skeleton className="h-40 w-full max-w-md" />
    </div>
  );
}

interface LoadErrorProps {
  title: string;
  error: unknown;
  onRetry?: (() => void) | undefined;
  /** Offer the conversation list (a detail that failed). */
  backToList?: boolean;
}

/** A 4xx shows the BE's own words; a 5xx / network failure offers a retry. */
export function LoadError({ title, error, onRetry, backToList = false }: LoadErrorProps) {
  return (
    <div className="space-y-3" role="alert">
      <Alert tone="danger" title={title}>
        {describeBeRefusal(error, CHAT_MESSAGE_BY_CODE)}
      </Alert>
      <div className="flex flex-wrap gap-2">
        {backToList ? (
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
            <Link href={STORE_ROUTES.chat.list}>Tất cả cuộc trò chuyện</Link>
          </Button>
        ) : null}
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={onRetry}
          >
            <RefreshCw aria-hidden className="size-4" />
            Thử lại
          </Button>
        ) : null}
      </div>
    </div>
  );
}
