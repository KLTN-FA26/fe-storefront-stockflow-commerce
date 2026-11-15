"use client";

import { useQuery } from "@tanstack/react-query";

import { QUERY_TIMES } from "@/lib/api/query-client";
import { retryTransient } from "@/lib/api/retry";

import { designKeys, useDesignDocument, usePrintConfig, usePrintConfigs } from "../queries";
import { isPrintConfigUsable } from "../selectors";
import type { Design, DesignDocumentRecord, PrintConfig } from "../types";

/** The SKUs of a product's variants, read on demand by the page that knows the catalogue. */
export type ProductSkusLoader = (productSlug: string, signal?: AbortSignal) => Promise<string[]>;

/** A variant a design can be copied to: another one of its product that takes designs. */
export type CloneTarget = { sku: string; config: PrintConfig };

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
 * What "Nhân bản sang cỡ khác" needs about a design (spec 2026-11-12 §7): the other variants of
 * its product (from the catalogue, through `skusOf`), the ones whose print configuration is usable,
 * and the design's own template and document to re-fit. Read while the dialog is open.
 */
export function useCloneTargets(
  design: Design,
  skusOf: ProductSkusLoader | undefined,
): CloneTargets {
  const slug = design.product.slug;
  const skus = useQuery({
    queryKey: designKeys.variantSkus(slug),
    queryFn: ({ signal }) => skusOf!(slug, signal),
    enabled: skusOf !== undefined,
    retry: retryTransient,
    ...QUERY_TIMES.detail,
  });
  const others = (skus.data ?? []).filter((sku) => sku !== design.variant.sku);
  const configs = usePrintConfigs(slug, others);
  const own = usePrintConfig(slug, design.variant.sku, true);
  const record = useDesignDocument(design.id, true);

  if (skusOf === undefined) return { status: "unavailable" };
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
  const targets = others.flatMap((sku, i) => {
    const config = configs[i]!.data;
    return config && isPrintConfigUsable(config) ? [{ sku, config }] : [];
  });
  // The design's own variant lost its print configuration: nothing to re-fit from.
  if (!own.data) return { status: "unavailable" };
  return { status: "ready", targets, source: { config: own.data, record: record.data! } };
}
