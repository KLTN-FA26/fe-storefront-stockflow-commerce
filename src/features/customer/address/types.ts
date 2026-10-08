import type { z } from "zod";

import type {
  addressFormSchema,
  addressTypeSchema,
  customerAddressDtoSchema,
  saveAddressRequestSchema,
} from "./schemas";

export type AddressType = z.infer<typeof addressTypeSchema>;
export type CustomerAddressDto = z.infer<typeof customerAddressDtoSchema>;
export type SaveAddressRequest = z.infer<typeof saveAddressRequestSchema>;
export type AddressFormInput = z.input<typeof addressFormSchema>;
export type AddressFormValues = z.output<typeof addressFormSchema>;
