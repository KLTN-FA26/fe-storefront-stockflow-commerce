"use client";

import Link from "next/link";
import { MessageCircle, Palette, RefreshCw } from "lucide-react";

import { Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";

import { usePrintConfig } from "../queries";
import { isPrintConfigUsable } from "../selectors";

/**
 * The design button of the product page for the chosen variant (catalog §4.4, BR-14): "Thiết kế"
 * when the variant has a usable print configuration (an ACTIVE variant of an APPROVED or PUBLISHED
 * product); otherwise the reason and the way to Sales.
 */
export function DesignEntry({
  productSlug,
  sku,
  withSalesChat = true,
}: {
  productSlug: string;
  sku: string;
  /**
   * Offer "Chat với Sale" beside the reason. false where the page already offers it, so the
   * customer does not get it twice: the product page's purchase panel quotes every customizable
   * product through the Sales chat.
   */
  withSalesChat?: boolean;
}) {
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
  if (config.data && isPrintConfigUsable(config.data)) {
    return (
      <Button asChild variant="secondary" className="min-h-11 rounded-[var(--r-md)]">
        <Link href={STORE_ROUTES.design.newFor(productSlug, sku)}>
          <Palette aria-hidden className="size-4" />
          Thiết kế
        </Link>
      </Button>
    );
  }
  if (!withSalesChat) {
    return (
      <p className="text-ink-secondary self-center text-sm">Quy cách này chưa nhận thiết kế</p>
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
