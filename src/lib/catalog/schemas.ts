import { z } from "zod";

import { ENUM_UNKNOWN, tolerantEnum } from "@/lib/validation/tolerant-enum";

// The BE catalog reads that both the catalogue screens and the cart/checkout need: the stock
// indicator (SCRUM-158) and the customer's price list (SCRUM-428). Shared here so that features
// depend on `lib`, not on each other.

/**
 * BE common.domain.Sku: 1-64 of letters, digits, '.', '_' or '-', not starting with a separator.
 * The BE upper-cases whatever it is given, so the FE keeps SKUs upper-case to compare them.
 */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const isValidSku = (sku: string) => SKU_PATTERN.test(sku);
export const normalizeSku = (sku: string) => sku.trim().toUpperCase();

/** BE catalog.internal.domain.Availability. PRE_ORDER does not exist yet (kltn-docs 13 §4.2). */
export const AVAILABILITIES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const;
export type KnownAvailability = (typeof AVAILABILITIES)[number];
export const AVAILABILITY_UNKNOWN = ENUM_UNKNOWN;
export const availabilitySchema = tolerantEnum(AVAILABILITIES);

// ISO 4217; the storefront sells in VND only today (BE OQ-09).
export const currencySchema = z.enum(["VND", "USD", "CNY"]);

// Jackson runs with `default-property-inclusion: non_null`: a nullable field is absent from the
// JSON, not null. These two answers have none.

/** GET /catalog/products/availability (SkuAvailabilityResponse): an indicator, never a number. */
export const skuAvailabilityDtoSchema = z.object({
  sku: z.string().min(1),
  availability: availabilitySchema,
});
export const skuAvailabilitiesDtoSchema = z.array(skuAvailabilityDtoSchema);

// BE AvailabilityProperties.maxSkusPerRequest default.
export const SKUS_PER_REQUEST = 50;

export const skuListInputSchema = z
  .array(z.string().transform(normalizeSku).pipe(z.string().regex(SKU_PATTERN)))
  .min(1)
  .max(SKUS_PER_REQUEST);
