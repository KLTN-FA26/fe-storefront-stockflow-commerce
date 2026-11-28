import { z } from "zod";

import { requiredString, vietnamPhone } from "@/lib/validation/primitives";

/**
 * BE `CustomerResponse` (GET/PUT /customers/me, masked). The BE drops null fields (Jackson non_null), so the optional
 * ones may be missing as well as null; and it is not `.strict()`: a field the BE adds later (as `taxCode` was) must not
 * make the profile fail to load.
 */
export const customerProfileSchema = z.object({
  customerId: z.string().min(1),
  userId: z.string().min(1),
  fullName: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().nullish(),
  /** Masked by the BE (`031****074`): shown as it comes, never sent back. */
  taxCode: z.string().nullish(),
  segmentId: z.string().nullish(),
  status: z.string().min(1),
  version: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});

const profilePhoneSchema = vietnamPhone.trim();

export const customerProfileFormSchema = z.object({
  fullName: requiredString("Tên khách hàng là bắt buộc").max(
    200,
    "Tên khách hàng tối đa 200 ký tự",
  ),
  phone: profilePhoneSchema,
});

export const customerProfileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: vietnamPhone.transform((value) => value.trim()).nullable(),
  version: z.number().int().nonnegative(),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type CustomerProfileFormValues = z.infer<typeof customerProfileFormSchema>;
export type CustomerProfileUpdate = z.infer<typeof customerProfileUpdateSchema>;
