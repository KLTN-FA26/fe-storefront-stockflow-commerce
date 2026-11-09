"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";

import { describeDesignError } from "../errors";
import { usePrintConfig } from "../queries";
import { isPrintConfigUsable } from "../selectors";
import { RetryButton } from "./design-list-states";
import { VariantChoice } from "./variant-choice";

/** A printable product of the catalogue and the SKUs of its variants. */
export type DesignableProduct = {
  slug: string;
  title: string;
  skus: string[];
};

/** What the page gives the dialog: the catalogue's printable products, once they are loaded. */
export type DesignableCatalogue =
  | { status: "loading" }
  | { status: "error"; error: unknown; onRetry: () => void; retrying: boolean }
  | { status: "ready"; products: DesignableProduct[] };

const normalize = (text: string) => text.toLocaleLowerCase("vi").trim();

/**
 * "Thiết kế mới" (spec §6.3): product (searched, from the catalogue once it is loaded), then one of
 * its variants that has a usable print configuration; the launcher opens for it.
 */
export function NewDesignDialog({
  catalogue,
  open,
  onOpenChange,
}: {
  catalogue: DesignableCatalogue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const products = catalogue.status === "ready" ? catalogue.products : [];
  const product = products.find((p) => p.slug === slug) ?? null;
  const shown = products.filter((p) => normalize(p.title).includes(normalize(query)));
  // The variant list read this configuration already: the cache answers it.
  const config = usePrintConfig(slug ?? "", sku ?? "", Boolean(slug && sku));
  const accepted = config.data != null && isPrintConfigUsable(config.data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">Thiết kế mới</DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            Chọn sản phẩm in được, rồi chọn quy cách bạn muốn thiết kế.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="design-product-search" className="text-ink-primary text-sm font-medium">
            Tìm sản phẩm
          </Label>
          <Input
            id="design-product-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-11 rounded-[var(--r-md)]"
          />
          {catalogue.status === "loading" ? (
            <div role="status" aria-label="Đang tải danh sách sản phẩm" className="space-y-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-[var(--r-md)]" />
              ))}
            </div>
          ) : null}
          {catalogue.status === "error" ? (
            <div className="space-y-2">
              <Alert tone="danger" title="Không tải được danh sách sản phẩm">
                {describeDesignError(catalogue.error)}
              </Alert>
              <RetryButton onRetry={catalogue.onRetry} retrying={catalogue.retrying} />
            </div>
          ) : null}
          <ul
            aria-label="Sản phẩm in được"
            hidden={catalogue.status !== "ready"}
            className="max-h-48 space-y-1 overflow-y-auto"
          >
            {shown.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  aria-pressed={p.slug === slug}
                  onClick={() => {
                    setSlug(p.slug);
                    setSku(null);
                  }}
                  className={cn(
                    "text-ink-primary focus-visible:ring-accent min-h-11 w-full rounded-[var(--r-md)] border px-3 text-left text-sm outline-none focus-visible:ring-2",
                    p.slug === slug
                      ? "border-accent bg-bg-muted"
                      : "border-border-default hover:bg-bg-subtle",
                  )}
                >
                  {p.title}
                </button>
              </li>
            ))}
            {catalogue.status === "ready" && shown.length === 0 ? (
              <li className="text-ink-tertiary px-1 py-2 text-sm">
                Không tìm thấy sản phẩm phù hợp.
              </li>
            ) : null}
          </ul>
        </div>

        {product ? (
          <VariantChoice
            key={product.slug}
            productSlug={product.slug}
            skus={product.skus}
            value={sku}
            onChange={setSku}
          />
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => onOpenChange(false)}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={!accepted}
            onClick={() => {
              if (slug && sku) router.push(STORE_ROUTES.design.newFor(slug, sku));
            }}
          >
            Bắt đầu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
