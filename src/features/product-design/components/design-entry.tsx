"use client";

import Link from "next/link";
import { MessageCircle, Palette, RefreshCw } from "lucide-react";

import { Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";

import { usePrintConfig } from "../queries";

/**
 * The design button of the product page for the chosen variant (catalog §4.4, BR-14): "Thiết kế"
 * when the variant has an ACTIVE print configuration; otherwise the reason and the way to Sales.
 */
export function DesignEntry({ productSlug, sku }: { productSlug: string; sku: string }) {
  const config = usePrintConfig(productSlug, sku, true);

  if (config.isPending) return <Skeleton className="min-h-11 w-full rounded-[var(--r-md)]" />;
  if (config.isError) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-[var(--r-md)]"
        onClick={() => void config.refetch()}
        disabled={config.isFetching}
      >
        <RefreshCw aria-hidden className="size-4" />
        Thử lại kiểm tra thiết kế
      </Button>
    );
  }
  if (config.data?.variantStatus === "ACTIVE") {
    return (
      <Button asChild variant="secondary" className="min-h-11 rounded-[var(--r-md)]">
        <Link href={STORE_ROUTES.design.newFor(productSlug, sku)}>
          <Palette aria-hidden className="size-4" />
          Thiết kế
        </Link>
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-ink-secondary text-sm">Quy cách này chưa nhận thiết kế</p>
      <Button asChild variant="outline" className="min-h-11 w-full rounded-[var(--r-md)]">
        <Link href={STORE_ROUTES.chat.list}>
          <MessageCircle aria-hidden className="size-4" />
          Chat với Sale
        </Link>
      </Button>
    </div>
  );
}
