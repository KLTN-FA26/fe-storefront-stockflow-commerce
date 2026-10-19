import type { z } from "zod";

import type {
  availabilitySchema,
  priceScheduleDtoSchema,
  skuAvailabilityDtoSchema,
} from "./schemas";

export type Availability = z.infer<typeof availabilitySchema>;
export type SkuAvailability = z.infer<typeof skuAvailabilityDtoSchema>;
export type PriceSchedule = z.infer<typeof priceScheduleDtoSchema>;
export type PriceTier = PriceSchedule["tiers"][number];
