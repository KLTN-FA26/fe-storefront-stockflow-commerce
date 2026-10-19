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

/** BE PriceSchedule.source: whose price list answered. Display only. */
export const PRICE_SOURCES = ["CUSTOMER", "SEGMENT", "BASE"] as const;
export const priceSourceSchema = tolerantEnum(PRICE_SOURCES);

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

/** GET /catalog/products/prices (PriceScheduleResponse). */
export const priceScheduleDtoSchema = z.object({
  sku: z.string().min(1),
  source: priceSourceSchema,
  // First tier's quantity (kltn-docs 13 BR-05).
  moq: z.number().int().positive(),
  currency: currencySchema,
  tiers: z.array(
    z.object({ minQuantity: z.number().int().positive(), unitPrice: z.number().nonnegative() }),
  ),
});
export const priceSchedulesDtoSchema = z.array(priceScheduleDtoSchema);

// BE AvailabilityProperties.maxSkusPerRequest / StorefrontPriceService.MAX_SKUS default.
export const SKUS_PER_REQUEST = 50;

export const skuListInputSchema = z
  .array(z.string().transform(normalizeSku).pipe(z.string().regex(SKU_PATTERN)))
  .min(1)
  .max(SKUS_PER_REQUEST);
