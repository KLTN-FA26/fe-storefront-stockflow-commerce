import { z } from "zod";

import { beId, requiredString, vietnamPhone } from "@/lib/validation/primitives";

// Mirrors BE customer.internal.domain.AddressType. Default address is tracked per type.
export const ADDRESS_TYPES = ["SHIPPING", "BILLING"] as const;
export const addressTypeSchema = z.enum(ADDRESS_TYPES);

// ── DTO — mirrors BE CustomerAddressResponse (NON_NULL: optional fields may be absent) ──
export const customerAddressDtoSchema = z.object({
  addressId: beId(),
  // Kept as string like customerProfileSchema.customerId (dev mock uses non-UUID ids).
  customerId: z.string().min(1),
  type: addressTypeSchema,
  recipientName: z.string().min(1),
  phone: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  wardCode: z.string().min(1),
  wardName: z.string().min(1),
  provinceCode: z.string().min(1),
  provinceName: z.string().min(1),
  countryCode: z.string().min(1),
  postalCode: z.string().nullable().optional(),
  defaultAddress: z.boolean(),
  version: z.number().int().nonnegative(),
});

// ── Request — mirrors BE SaveAddressRequest bean validation ──
const requiredPhone = z.string().trim().min(1).pipe(vietnamPhone);

export const saveAddressRequestSchema = z.object({
  type: addressTypeSchema,
  recipientName: z.string().trim().min(1).max(200),
  phone: requiredPhone,
  line1: z.string().trim().min(1).max(255),
  line2: z.string().trim().max(255).nullable(),
  wardCode: z.string().trim().min(1).max(20),
  wardName: z.string().trim().min(1).max(120),
  provinceCode: z.string().trim().min(1).max(20),
  provinceName: z.string().trim().min(1).max(120),
  countryCode: z.literal("VN"),
  postalCode: z.string().trim().max(20).nullable(),
  defaultAddress: z.boolean(),
  // BE: @PositiveOrZero Long, optional — sent so a stale edit gets 409 OPTIMISTIC_LOCK.
  version: z.number().int().nonnegative().nullable(),
});

// ── Form — field names equal BE field names so server fieldErrors map 1:1 ──
export const addressFormSchema = z.object({
  type: addressTypeSchema,
  recipientName: requiredString("Tên người nhận là bắt buộc").max(200, "Tối đa 200 ký tự"),
  phone: requiredString("Số điện thoại là bắt buộc").pipe(vietnamPhone),
  line1: requiredString("Địa chỉ chi tiết là bắt buộc").max(255, "Tối đa 255 ký tự"),
  line2: z.string().trim().max(255, "Tối đa 255 ký tự"),
  provinceCode: requiredString("Vui lòng chọn tỉnh/thành").max(20),
  provinceName: requiredString("Vui lòng chọn tỉnh/thành").max(120),
  wardCode: requiredString("Vui lòng chọn phường/xã").max(20),
  wardName: requiredString("Vui lòng chọn phường/xã").max(120),
  postalCode: z.string().trim().max(20, "Tối đa 20 ký tự"),
  defaultAddress: z.boolean(),
});

export const ADDRESS_FORM_FIELDS = Object.keys(addressFormSchema.shape) as ReadonlyArray<
  keyof z.input<typeof addressFormSchema>
>;
