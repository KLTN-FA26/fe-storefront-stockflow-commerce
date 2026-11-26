"use client";

import Link from "next/link";
import { Loader2, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";

import { BRAND, CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth/safe-next";
import { cn } from "@/lib/cn";

import { useProductId } from "../queries";

import { RetryButton } from "./design-list-states";

/**
 * The launcher lives in the studio route group, which has no storefront header: it frames itself with a slim bar (the
 * brand, the products, the design projects and the orders), so a customer whose design could not start still has a
 * way to the rest of the site instead of a bare page.
 */
export function LauncherFrame({ children }: { children: ReactNode }) {
  const link =
    "text-ink-secondary hover:text-ink-primary focus-visible:ring-accent inline-flex min-h-11 items-center rounded-[var(--r-md)] px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none";
  return (
    <>
      <header className="bg-bg-surface border-border-default border-b">
        <nav
          aria-label="Điều hướng"
          className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-1 px-4 sm:px-6"
        >
          <Link
            href="/"
            aria-label={`${BRAND.name} – Trang chủ`}
            className="font-display focus-visible:ring-accent mr-3 rounded-sm text-lg font-bold tracking-tight focus-visible:ring-2 focus-visible:outline-none"
          >
            <span>{BRAND.wordmark.primary}</span>
            <span className="text-accent">{BRAND.wordmark.accent}</span>
          </Link>
          <Link href={STORE_ROUTES.catalog.list} className={link}>
            Sản phẩm
          </Link>
          <Link href={STORE_ROUTES.design.projects} className={link}>
            Dự án thiết kế
          </Link>
          <Link href={STORE_ROUTES.account.orders.list} className={link}>
            Đơn hàng
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4 sm:p-6">
        {children}
      </main>
    </>
  );
}

/**
 * "Chat với Sale" about the product of the launcher link (chat kind PRODUCT, 16 BR-02): the product's id is read by its
 * slug; until it is known (or if it cannot be read) the chat opens without a context rather than not at all.
 */
export function ProductChatLink({
  productSlug,
  productId: knownId,
  variant = "default",
  className,
}: {
  productSlug: string;
  /** The product's id when the page already has it (the product page): then nothing is read. */
  productId?: string | undefined;
  variant?: "default" | "outline";
  className?: string;
}) {
  const fetched = useProductId(productSlug, knownId === undefined);
  const productId = knownId ?? fetched;
  return (
    <Button
      asChild
      variant={variant}
      className={cn("min-h-11 rounded-[var(--r-md)] px-5", className)}
    >
      <Link
        href={productId ? STORE_ROUTES.chat.about("PRODUCT", productId) : STORE_ROUTES.chat.new}
      >
        <MessageCircle aria-hidden className="size-4" />
        {CHAT_WITH_SALES}
      </Link>
    </Button>
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
  productSlug,
}: {
  /**
   * The variant has a print configuration but takes no designs: it is no longer ACTIVE (BLOCKED,
   * OBSOLETE), or its product is not APPROVED or PUBLISHED.
   */
  unavailable?: boolean;
  backHref: string;
  /** The product, so the Sales chat is about it. */
  productSlug: string;
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
          <ProductChatLink productSlug={productSlug} />
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
  chatProductSlug,
}: {
  title: string;
  message: string;
  /** Absent when trying again cannot help. */
  onRetry?: () => void;
  retrying?: boolean;
  backHref: string;
  backLabel?: string;
  /** When trying again cannot help, the way on is Sales: a chat about this product. */
  chatProductSlug?: string;
}) {
  return (
    <div className="space-y-4">
      <Alert tone="danger" title={title}>
        {message}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {onRetry ? <RetryButton onRetry={onRetry} retrying={retrying ?? false} /> : null}
        {!onRetry && chatProductSlug ? <ProductChatLink productSlug={chatProductSlug} /> : null}
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
        description="Hãy mở một sản phẩm in được, chọn quy cách và bấm “Thiết kế”."
        action={
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.catalog.list}>Xem sản phẩm</Link>
          </Button>
        }
      />
    </LauncherFrame>
  );
}
