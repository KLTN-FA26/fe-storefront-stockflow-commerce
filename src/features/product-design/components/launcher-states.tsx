"use client";

import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth/safe-next";

import { RetryButton } from "./design-list-states";

/** The launcher lives in the studio route group, which has no storefront header: it frames itself. */
export function LauncherFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4 sm:p-6">
      {children}
    </main>
  );
}

export function LauncherLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
      <Loader2 className="text-accent size-6 animate-spin" aria-hidden="true" />
      <p className="text-ink-secondary text-sm">{label}</p>
    </div>
  );
}

/** The variant cannot take a design: say why, and offer the Sales chat. */
export function LauncherNoPrintConfig({
  unavailable = false,
  backHref,
}: {
  /**
   * The variant has a print configuration but takes no designs: it is no longer ACTIVE (BLOCKED,
   * OBSOLETE), or its product is not APPROVED or PUBLISHED.
   */
  unavailable?: boolean;
  backHref: string;
}) {
  return (
    <EmptyState
      title={
        unavailable
          ? "Quy cách này hiện không còn nhận thiết kế."
          : "Quy cách này chưa nhận thiết kế."
      }
      description="Bạn vẫn có thể nhắn Sale để được tư vấn in theo yêu cầu."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.chat.list}>
              <MessageCircle aria-hidden className="size-4" />
              Chat với Sale
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={backHref}>Quay lại sản phẩm</Link>
          </Button>
        </div>
      }
    />
  );
}

/** The customer already holds the most drafts a customer may (docs 12 B37). */
export function LauncherDraftLimit({ limit }: { limit: number }) {
  return (
    <EmptyState
      title={`Bạn đã có ${limit} bản nháp`}
      description="Hãy xoá bớt bản nháp không dùng đến trong “Thiết kế của tôi” trước khi tạo bản mới."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={STORE_ROUTES.design.list}>Thiết kế của tôi</Link>
        </Button>
      }
    />
  );
}

/** `from` is the launcher link itself, so signing in brings the customer straight back to it. */
export function LauncherSignIn({ from }: { from: string }) {
  return (
    <EmptyState
      title="Đăng nhập để bắt đầu thiết kế"
      description="Đăng nhập để tạo thiết kế, lưu tiến độ và xem lại các thiết kế của bạn."
      action={
        <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
          <Link href={loginUrl(from)}>Đăng nhập</Link>
        </Button>
      }
    />
  );
}

export function LauncherError({
  title,
  message,
  onRetry,
  retrying,
  backHref,
  backLabel = "Quay lại sản phẩm",
}: {
  title: string;
  message: string;
  /** Absent when trying again cannot help. */
  onRetry?: () => void;
  retrying?: boolean;
  backHref: string;
  backLabel?: string;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="danger" title={title}>
        {message}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {onRetry ? <RetryButton onRetry={onRetry} retrying={retrying ?? false} /> : null}
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}

/** `/design/new` without a product and variant to design. */
export function LauncherMissingProduct() {
  return (
    <LauncherFrame>
      <EmptyState
        title="Chưa chọn quy cách để thiết kế"
        description="Hãy mở một sản phẩm in được, chọn phiên bản và bấm “Thiết kế”."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm</Link>
          </Button>
        }
      />
    </LauncherFrame>
  );
}
