import { AVAILABILITY_UNKNOWN, normalizeSku } from "./schemas";
import type { Availability, SkuAvailability } from "./types";

export const indexBySku = <T extends { sku: string }>(rows: readonly T[] | undefined) =>
  new Map((rows ?? []).map((row) => [normalizeSku(row.sku), row] as const));

export const availabilityBySku = (rows: readonly SkuAvailability[] | undefined) =>
  new Map((rows ?? []).map((row) => [normalizeSku(row.sku), row.availability] as const));

/** A product with several variants is as available as its best one (a customer picks that one). */
export function bestAvailability(list: readonly Availability[]): Availability | undefined {
  if (list.length === 0) return undefined;
  for (const wanted of ["IN_STOCK", "LOW_STOCK"] as const) {
    if (list.includes(wanted)) return wanted;
  }
  return list.every((a) => a === "OUT_OF_STOCK") ? "OUT_OF_STOCK" : AVAILABILITY_UNKNOWN;
}
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
