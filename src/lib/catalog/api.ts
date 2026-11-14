import { api } from "@/lib/api/client";
import { REPEATED_PARAMS } from "@/lib/api/repeated-params";

import { SKUS_PER_REQUEST, skuAvailabilitiesDtoSchema, skuListInputSchema } from "./schemas";
import type { SkuAvailability } from "./types";

// BE CatalogController: /api/v1/catalog/products/{availability,prices} — the /v1 prefix lives in
// API_URL. Both need a signed-in CUSTOMER with an ACTIVE profile (a staff token gets 403
// FORBIDDEN) and are rate-limited per user (120 calls / minute).

const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

/** The BE answers at most SKUS_PER_REQUEST SKUs per call; a longer list is asked in chunks. */
function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const uniqueSkus = (skus: readonly string[]) => [
  ...new Set(skus.map((sku) => sku.trim().toUpperCase())),
];

/**
 * GET /catalog/products/availability?sku=…&sku=… — one indicator per distinct SKU, in the order
 * asked (an unknown SKU is OUT_OF_STOCK).
 */
export async function getAvailability(
  skus: readonly string[],
  signal?: AbortSignal,
): Promise<SkuAvailability[]> {
  const parts = await Promise.all(
    chunks(uniqueSkus(skus), SKUS_PER_REQUEST).map(async (part) => {
      const { data } = await api.get<unknown>("/catalog/products/availability", {
        params: { sku: skuListInputSchema.parse(part) },
        ...REPEATED_PARAMS,
        ...withSignal(signal),
      });
      return skuAvailabilitiesDtoSchema.parse(data);
    }),
  );
  return parts.flat();
}
