"use client";

import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { designKeys, useDesignDocument, usePrintConfig, usePrintConfigs } from "../queries";
import { isPrintConfigUsable } from "../selectors";
import type { Design, DesignDocumentRecord, PrintConfig } from "../types";

/**
 * The SKUs of a product's variants, read on demand by the page that knows the catalogue, each with its name when the
 * catalogue gives one (a bare SKU string is read as a variant without a name).
 */
export type ProductSkusLoader = (
  productSlug: string,
  signal?: AbortSignal,
) => Promise<readonly (string | { sku: string; name?: string | null | undefined })[]>;

/** A variant a design can be copied to: another one of its product that takes designs. */
export type CloneTarget = { sku: string; name: string | null; config: PrintConfig };

export type CloneTargets =
  /** No catalogue to ask for the variants, or the design's own variant has no print configuration. */
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void; retrying: boolean }
  | {
      status: "ready";
      targets: CloneTarget[];
      /** What the copy is re-fitted from: the design's own template and document. */
      source: { config: PrintConfig; record: DesignDocumentRecord };
    };

/**
 * What "Nhân bản sang quy cách khác" needs about a design (spec 2026-11-12 §7): the other variants of
 * its product (from the catalogue, through `skusOf`), the ones whose print configuration is usable,
 * and the design's own template and document to re-fit. Read while the dialog is open.
 */
export function useCloneTargets(
  design: Design,
  skusOf: ProductSkusLoader | undefined,
): CloneTargets {
  const productSlug = design.product.slug;
  const slug = productSlug ?? "";
  const skus = useQuery({
    queryKey: designKeys.variantSkus(slug),
    queryFn: async ({ signal }) =>
      (await skusOf!(slug, signal)).map((entry) =>
        typeof entry === "string"
          ? { sku: entry, name: null }
          : { sku: entry.sku, name: entry.name?.trim() || null },
      ),
    enabled: skusOf !== undefined && productSlug !== null,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
  const others = (skus.data ?? []).filter((entry) => entry.sku !== design.variant.sku);
  const configs = usePrintConfigs(
    slug,
    others.map((entry) => entry.sku),
  );
  const own = usePrintConfig(slug, design.variant.sku, productSlug !== null);
  const record = useDesignDocument(design.id, true);

  // A product that is gone has no catalogue to list other sizes from.
  if (skusOf === undefined || productSlug === null) return { status: "unavailable" };
  const failing = [skus, ...configs, own, record].filter((query) => query.isError);
  if (failing.length > 0) {
    return {
      status: "error",
      error: failing[0]!.error,
      retry: () => failing.forEach((query) => void query.refetch()),
      retrying: failing.some((query) => query.isFetching),
    };
  }
  if (skus.isPending || own.isPending || record.isPending || configs.some((q) => q.isPending)) {
    return { status: "loading" };
  }
  // A variant without a usable print configuration cannot be picked, so it is not offered.
  const targets = others.flatMap(({ sku, name }, i) => {
    const config = configs[i]!.data;
    return config && isPrintConfigUsable(config) ? [{ sku, name, config }] : [];
  });
  // The design's own variant lost its print configuration: nothing to re-fit from.
  if (!own.data) return { status: "unavailable" };
  return { status: "ready", targets, source: { config: own.data, record: record.data! } };
}
