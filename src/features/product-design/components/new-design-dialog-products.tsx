"use client";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { describeDesignError } from "../errors";
import { RetryButton } from "./design-list-states";

/** A printable product of the catalogue and the SKUs of its variants. */
export type DesignableProduct = {
  slug: string;
  title: string;
  skus: string[];
};

/** The catalogue's further pages; `null` at its end. */
export type MoreProducts = { onLoad: () => void; loading: boolean; error: unknown };

/**
 * What the page gives the dialog: the catalogue's printable products for the text searched, once
 * they are loaded, and how to search it (server-side). The dialog calls `onSearch` when it opens
 * (`""`), once typing stops, and with `null` when it closes: the page reads the catalogue only
 * while the dialog is open.
 */
export type DesignableCatalogue = { onSearch: (text: string | null) => void } & (
  | { status: "loading" }
  | { status: "error"; error: unknown; onRetry: () => void; retrying: boolean }
  | {
      status: "ready";
      products: DesignableProduct[];
      /** The products of the previous search, still shown while this one loads. */
      stale: boolean;
      more: MoreProducts | null;
    }
);

function ProductsLoading() {
  return (
    <div role="status" aria-label="Đang tải danh sách sản phẩm" className="space-y-1">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-11 w-full rounded-[var(--r-md)]" />
      ))}
    </div>
  );
}

/**
 * The products of the search, one button each; while the first page loads, when it failed, and
 * "Xem thêm" for the next page. Nothing shown yet while the next page or the new search is read
 * is still loading, never "no match".
 */
export function ProductList({
  catalogue,
  picked,
  onPick,
}: {
  catalogue: DesignableCatalogue;
  /** The slug of the chosen product. */
  picked: string | null;
  onPick: (product: DesignableProduct) => void;
}) {
  if (catalogue.status === "loading") return <ProductsLoading />;
  if (catalogue.status === "error") {
    return (
      <div className="space-y-2">
        <Alert tone="danger" title="Không tải được danh sách sản phẩm">
          {describeDesignError(catalogue.error)}
        </Alert>
        <RetryButton onRetry={catalogue.onRetry} retrying={catalogue.retrying} />
      </div>
    );
  }
  const { products, stale, more } = catalogue;
  const waiting = products.length === 0 && (stale || more?.loading === true);
  return (
    // Padded so the focus ring of a row is not cut by the scroll box.
    <div className="max-h-48 space-y-2 overflow-y-auto p-0.5">
      <ul
        aria-label="Sản phẩm in được"
        aria-busy={stale}
        className={cn("space-y-1", stale && "opacity-60")}
      >
        {products.map((p) => (
          <li key={p.slug}>
            <button
              type="button"
              aria-pressed={p.slug === picked}
              onClick={() => onPick(p)}
              className={cn(
                "text-ink-primary focus-visible:ring-accent min-h-11 w-full rounded-[var(--r-md)] border px-3 text-left text-sm outline-none focus-visible:ring-2",
                p.slug === picked
                  ? "border-accent bg-bg-muted"
                  : "border-border-default hover:bg-bg-subtle",
              )}
            >
              {p.title}
            </button>
          </li>
        ))}
        {products.length === 0 && more === null && !stale ? (
          <li className="text-ink-tertiary px-1 py-2 text-sm">Không tìm thấy sản phẩm phù hợp.</li>
        ) : null}
      </ul>
      {waiting ? <ProductsLoading /> : null}
      {more?.error ? (
        <Alert tone="danger" title="Không tải thêm được sản phẩm">
          {describeDesignError(more.error)}
        </Alert>
      ) : null}
      {more && !waiting ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-[var(--r-md)]"
          disabled={more.loading}
          onClick={more.onLoad}
        >
          {more.loading ? "Đang tải thêm…" : "Xem thêm"}
        </Button>
      ) : null}
    </div>
  );
}
