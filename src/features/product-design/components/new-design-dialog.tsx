"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";

import { STORE_ROUTES } from "@/constants";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";

import { usePrintConfig } from "../queries";
import { isPrintConfigUsable } from "../selectors";
import {
  ProductList,
  type DesignableCatalogue,
  type DesignableProduct,
} from "./new-design-dialog-products";
import { VariantChoice } from "./variant-choice";

export type {
  DesignableCatalogue,
  DesignableProduct,
  MoreProducts,
} from "./new-design-dialog-products";

/** The catalogue is asked this long after typing stops (one request per settled text). */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * "Thiết kế mới" (spec §6.3): product (searched in the catalogue), then one of its variants that
 * has a usable print configuration; the launcher opens for it.
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        {/* The content unmounts when the dialog closes: it opens again with nothing chosen. */}
        <NewDesignForm catalogue={catalogue} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewDesignForm({
  catalogue,
  onCancel,
}: {
  catalogue: DesignableCatalogue;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The product itself, not its slug: a later search may leave it out of the list.
  const [product, setProduct] = useState<DesignableProduct | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const searched = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim();
  const search = useEffectEvent((text: string | null) => catalogue.onSearch(text));
  useEffect(() => {
    search(searched);
  }, [searched]);
  // Closing drops the search and stops the page reading the catalogue until the dialog opens again.
  useEffect(() => () => search(null), []);
  // The variant list read this configuration already: the cache answers it.
  const config = usePrintConfig(product?.slug ?? "", sku ?? "", Boolean(product && sku));
  const accepted = config.data != null && isPrintConfigUsable(config.data);

  return (
    <>
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
        <ProductList
          catalogue={catalogue}
          picked={product?.slug ?? null}
          onPick={(next) => {
            setProduct(next);
            setSku(null);
          }}
        />
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
          onClick={onCancel}
        >
          Huỷ
        </Button>
        <Button
          type="button"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={!accepted}
          onClick={() => {
            if (product && sku) router.push(STORE_ROUTES.design.newFor(product.slug, sku));
          }}
        >
          Bắt đầu
        </Button>
      </DialogFooter>
    </>
  );
}
