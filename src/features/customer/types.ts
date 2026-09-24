import type { z } from "zod";
import type {
  customerAddressDtoSchema,
  customerMeDtoSchema,
  saveAddressInputSchema,
} from "./schemas";

export type CustomerAddressDto = z.infer<typeof customerAddressDtoSchema>;
export type SaveAddressInput = z.infer<typeof saveAddressInputSchema>;
export type AddressFormValues = SaveAddressInput;
export type CustomerMeDto = z.infer<typeof customerMeDtoSchema>;

// Backward-compat alias: some components still import `Address`.
export type Address = CustomerAddressDto;
