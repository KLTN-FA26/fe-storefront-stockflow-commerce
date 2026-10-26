import { AVAILABILITY_UNKNOWN, normalizeSku } from "./schemas";
import type { Availability, PriceSchedule, SkuAvailability } from "./types";

export const indexBySku = <T extends { sku: string }>(rows: readonly T[] | undefined) =>
  new Map((rows ?? []).map((row) => [normalizeSku(row.sku), row] as const));

export const availabilityBySku = (rows: readonly SkuAvailability[] | undefined) =>
  new Map((rows ?? []).map((row) => [normalizeSku(row.sku), row.availability] as const));

/**
 * Unit price for `quantity` of a SKU: the tier with the highest minimum the quantity reaches
 * (kltn-docs 13 BR-05). `undefined` below the first tier — the BE refuses such a line
 * (CUSTOMER_PRICE_BELOW_MOQ) and Sales quotes it instead — and when the SKU has no price at all.
 * The BE prices a SKU on the order's total of it, so pass the SKU's total quantity, not a line's.
 */
export function unitPriceFor(
  schedule: PriceSchedule | undefined,
  quantity: number,
): number | undefined {
  if (!schedule) return undefined;
  const reached = schedule.tiers.filter((tier) => tier.minQuantity <= quantity);
  if (reached.length === 0) return undefined;
  return reached.reduce((best, tier) => (tier.minQuantity >= best.minQuantity ? tier : best))
    .unitPrice;
}

/** The lowest unit price any tier offers: the "from" price on a card. */
export function lowestUnitPrice(schedules: readonly PriceSchedule[]): number | undefined {
  const prices = schedules.flatMap((schedule) => schedule.tiers.map((tier) => tier.unitPrice));
  return prices.length === 0 ? undefined : Math.min(...prices);
}

/** A product with several variants is as available as its best one (a customer picks that one). */
export function bestAvailability(list: readonly Availability[]): Availability | undefined {
  if (list.length === 0) return undefined;
  for (const wanted of ["IN_STOCK", "LOW_STOCK"] as const) {
    if (list.includes(wanted)) return wanted;
  }
  return list.every((a) => a === "OUT_OF_STOCK") ? "OUT_OF_STOCK" : AVAILABILITY_UNKNOWN;
}

/** Out of stock is the only state the BE refuses to sell; an unknown one is left to the checkout. */
export const canBuy = (availability: Availability | undefined) => availability !== "OUT_OF_STOCK";

/** Badge vocabulary of components/storefront/availability-badge; unknown shows no badge. */
export function badgeStatus(availability: Availability | undefined) {
  switch (availability) {
    case "IN_STOCK":
      return "in-stock" as const;
    case "LOW_STOCK":
      return "low-stock" as const;
    case "OUT_OF_STOCK":
      return "out-of-stock" as const;
    default:
      return undefined;
  }
}
