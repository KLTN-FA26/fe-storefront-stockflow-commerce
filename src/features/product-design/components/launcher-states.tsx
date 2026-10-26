"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth/safe-next";
import { useIsMock } from "@/providers/app-providers";

import { designCapabilities } from "../capabilities";
import { AskSalesActions, RetryButton, SALES_DESIGNS_FOR_YOU } from "./design-list-states";

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

/**
 * P1/P2 are proposed endpoints: until the BE ships them a customer cannot start a design, and
 * Sales designs for them instead, so the way on is the Sales chat.
 */
export function LauncherUnavailable({
  back = { href: STORE_ROUTES.catalog.list, label: "Xem sản phẩm" },
}: {
  back?: { href: string; label: string };
}) {
  return (
    <EmptyState
      title="Thiết kế trực tuyến chưa mở"
      description={SALES_DESIGNS_FOR_YOU}
      action={<AskSalesActions back={back} />}
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
}: {
  title: string;
  message: string;
  /** Absent when trying again cannot help (the variant has no template). */
  onRetry?: () => void;
  retrying?: boolean;
  backHref: string;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="danger" title={title}>
        {message}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {onRetry ? <RetryButton onRetry={onRetry} retrying={retrying ?? false} /> : null}
        <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
          <Link href={backHref}>Quay lại sản phẩm</Link>
        </Button>
      </div>
    </div>
  );
}

/** `/design/new` without a product to design; without self-service, the Sales way in instead. */
export function LauncherMissingProduct() {
  const { selfService } = designCapabilities(useIsMock());
  return (
    <LauncherFrame>
      {selfService ? (
        <EmptyState
          title="Chưa chọn sản phẩm để thiết kế"
          description="Hãy mở một sản phẩm in được và bấm “Bắt đầu thiết kế”."
          action={
            <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
              <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm</Link>
            </Button>
          }
        />
      ) : (
        <LauncherUnavailable />
      )}
    </LauncherFrame>
  );
}
