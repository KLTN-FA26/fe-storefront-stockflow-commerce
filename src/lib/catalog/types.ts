import type { z } from "zod";

import type { availabilitySchema, skuAvailabilityDtoSchema } from "./schemas";

export type Availability = z.infer<typeof availabilitySchema>;
export type SkuAvailability = z.infer<typeof skuAvailabilityDtoSchema>;
