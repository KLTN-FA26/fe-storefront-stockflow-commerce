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

import { usePrintConfig, usePrintConfigs } from "../queries";
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

/** The search box appears from this many printable products (or when there are further pages to search through). */
const SEARCH_FROM = 8;

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
  projectId,
}: {
  catalogue: DesignableCatalogue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The project the new design joins (the project page); none from "Thiết kế của tôi". */
  projectId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        {/* The content unmounts when the dialog closes: it opens again with nothing chosen. */}
        <NewDesignForm
          catalogue={catalogue}
          projectId={projectId}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewDesignForm({
  catalogue,
  projectId,
  onCancel,
}: {
  catalogue: DesignableCatalogue;
  projectId: string | undefined;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // The product itself, not its slug: a later search may leave it out of the list.
  const [picked, setPicked] = useState<DesignableProduct | null>(null);
  const [sku, setSku] = useState<string | null>(null);
  const searched = useDebouncedValue(query, SEARCH_DEBOUNCE_MS).trim();
  const search = useEffectEvent((text: string | null) => catalogue.onSearch(text));
  useEffect(() => {
    search(searched);
  }, [searched]);
  // Closing drops the search and stops the page reading the catalogue until the dialog opens again.
  useEffect(() => () => search(null), []);
  // The only printable product is chosen for the customer (R6); a list the customer searched is theirs to pick from.
  const listed = catalogue.status === "ready" && !catalogue.stale ? catalogue.products : [];
  const only =
    catalogue.status === "ready" &&
    catalogue.more === null &&
    searched === "" &&
    listed.length === 1
      ? (listed[0] ?? null)
      : null;
  const product = picked ?? only;
  // A search box for a handful of products is a hurdle, not a help: it comes with a long list.
  // Not while the catalogue loads (or failed): the box would appear and then vanish for a short list.
  const searchable =
    query !== "" ||
    (catalogue.status === "ready" &&
      (catalogue.more !== null || catalogue.products.length >= SEARCH_FROM));
  // The variant list read this configuration already: the cache answers it.
  const config = usePrintConfig(product?.slug ?? "", sku ?? "", Boolean(product && sku));
  const accepted = config.data != null && isPrintConfigUsable(config.data);
  // What is still missing, named under the button (R7). The variants' checks are the ones the list below already runs
  // (the cache answers them): nothing is said while they are under way, and a product none of whose variants takes
  // designs is said so instead of asking for a choice there is none to make.
  const checks = usePrintConfigs(product?.slug ?? "", product?.skus ?? []);
  const checking = checks.some((check) => check.isPending);
  const noneTakesDesigns =
    product !== null &&
    !checking &&
    checks.every((check) => check.data == null || !isPrintConfigUsable(check.data));
  const missing = accepted
    ? null
    : !product
      ? "Chọn sản phẩm và quy cách để tiếp tục"
      : checking
        ? null
        : noneTakesDesigns
          ? "Sản phẩm này chưa có quy cách nhận thiết kế"
          : sku === null
            ? "Chọn quy cách để tiếp tục"
            : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-ink-primary text-lg font-semibold">Thiết kế mới</DialogTitle>
        <DialogDescription className="text-ink-secondary text-sm">
          {projectId
            ? "Chọn sản phẩm in được, rồi chọn quy cách. Bản mới sẽ nằm trong dự án này."
            : "Chọn sản phẩm in được, rồi chọn quy cách bạn muốn thiết kế."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        {searchable ? (
          <>
            <Label htmlFor="design-product-search" className="text-ink-primary text-sm font-medium">
              Tìm sản phẩm
            </Label>
            <Input
              id="design-product-search"
              type="search"
              value={query}
              placeholder="Gõ tên sản phẩm, ví dụ: ly giấy"
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-11 rounded-[var(--r-md)]"
            />
          </>
        ) : (
          <p className="text-ink-primary text-sm font-medium">Sản phẩm in được</p>
        )}
        <ProductList
          catalogue={catalogue}
          picked={product?.slug ?? null}
          onPick={(next) => {
            setPicked(next);
            setSku(null);
          }}
        />
      </div>

      {product ? (
        <VariantChoice
          key={product.slug}
          productSlug={product.slug}
          productTitle={product.title}
          skus={product.skus}
          names={product.skuNames}
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
            if (product && sku)
              router.push(STORE_ROUTES.design.newFor(product.slug, sku, projectId));
          }}
        >
          Bắt đầu
        </Button>
      </DialogFooter>
      {missing ? (
        <p role="status" className="text-ink-secondary -mt-2 text-right text-sm">
          {missing}
        </p>
      ) : null}
    </>
  );
}
