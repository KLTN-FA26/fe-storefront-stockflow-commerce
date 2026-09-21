import { z } from "zod";

import { requiredString, vietnamPhone } from "@/lib/validation/primitives";

export const customerProfileSchema = z
  .object({
    customerId: z.string().min(1),
    userId: z.string().min(1),
    fullName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().nullable(),
    segmentId: z.string().nullable(),
    status: z.string().min(1),
    version: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
  })
  .strict();

const profilePhoneSchema = vietnamPhone.trim();

export const customerProfileFormSchema = z.object({
  fullName: requiredString("Họ và tên là bắt buộc").max(200, "Họ và tên tối đa 200 ký tự"),
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
