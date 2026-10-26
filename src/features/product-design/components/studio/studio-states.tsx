"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { RetryButton } from "../design-list-states";

function BackToDesigns({ variant }: { variant?: "outline" }) {
  return (
    <Button asChild variant={variant} className="min-h-11 rounded-[var(--r-md)] px-5">
      <Link href={STORE_ROUTES.design.list}>Về thiết kế của tôi</Link>
    </Button>
  );
}

/** The studio has no storefront header around it: a state that replaces it frames itself. */
function StudioStateFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-4 sm:p-6">
      {children}
    </main>
  );
}

export function StudioNotFound() {
  return (
    <StudioStateFrame>
      <EmptyState
        title="Không tìm thấy thiết kế"
        description="Thiết kế này không tồn tại hoặc không thuộc tài khoản của bạn."
        action={<BackToDesigns />}
      />
    </StudioStateFrame>
  );
}

/** `onRetry` is absent when trying again cannot help (the product has no template for the design). */
export function StudioLoadError({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <StudioStateFrame>
      <Alert tone="danger" title="Không mở được trình thiết kế">
        {message}
      </Alert>
      <div className="flex flex-wrap gap-3">
        {onRetry ? <RetryButton onRetry={onRetry} retrying={retrying} /> : null}
        <BackToDesigns variant="outline" />
      </div>
    </StudioStateFrame>
  );
}
