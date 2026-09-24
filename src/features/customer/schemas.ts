import { z } from "zod";

// ── Helpers ───────────────────────────────────────────────────────────────
// Strip separators people type (space, dot, hyphen, parens) before matching.
// Mirrors BE VietnamPhoneValidator.SEPARATORS.
const PHONE_SEPARATORS_RE = /[\s.\-()]/g;
function stripPhoneSeparators(v: string): string {
  return v.replace(PHONE_SEPARATORS_RE, "");
}
// After stripping: (+84|84|0) + (mobile 3/5/7/8/9 + 8 digits  OR  landline 2 + 9 digits)
// Mirrors BE VietnamPhoneValidator.NORMALISED = ^(?:\+?84|0)(?:[35789]\d{8}|2\d{9})$
const PHONE_NORMALISED_RE = /^(?:\+?84|0)(?:[35789]\d{8}|2\d{9})$/;

// ── DTO — mirrors BE CustomerAddressResponse ────────────────────────────
export const customerAddressDtoSchema = z.object({
  addressId: z.string().min(1),
  customerId: z.string().min(1),
  type: z.enum(["SHIPPING", "BILLING"]),
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

// ── Input — mirrors BE SaveAddressRequest ───────────────────────────────
export const saveAddressInputSchema = z.object({
  type: z.enum(["SHIPPING", "BILLING"]).default("SHIPPING"),
  recipientName: z.string().min(1, "Tên người nhận là bắt buộc").max(200),
  phone: z
    .string()
    .min(1, "Số điện thoại là bắt buộc")
    .transform((v) => v.trim())
    .refine((v) => PHONE_NORMALISED_RE.test(stripPhoneSeparators(v)), {
      message: "Số điện thoại không hợp lệ",
    }),
  line1: z.string().min(1, "Địa chỉ chi tiết là bắt buộc").max(255),
  line2: z.string().max(255).optional().nullable(),
  wardCode: z.string().min(1, "Mã phường/xã là bắt buộc").max(20),
  wardName: z.string().min(1, "Phường/Xã là bắt buộc").max(120),
  provinceCode: z.string().min(1, "Mã tỉnh/thành là bắt buộc").max(20),
  provinceName: z.string().min(1, "Tỉnh/Thành phố là bắt buộc").max(120),
  countryCode: z
    .string()
    .default("VN")
    .refine((v) => v === "VN", { message: "Chỉ hỗ trợ địa chỉ VN" }),
  postalCode: z.string().max(20).optional().nullable(),
  defaultAddress: z.boolean().default(false),
  version: z.number().int().nonnegative().optional(),
});

export type SaveAddressInput = z.infer<typeof saveAddressInputSchema>;
// Alias kept for existing imports (mutations/pages currently import AddressFormValues)
export type AddressFormValues = SaveAddressInput;

// ── Customer /me — minimal shape needed to resolve customerId ──────────
export const customerMeDtoSchema = z.object({
  customerId: z.string().min(1),
  userId: z.string().min(1),
  fullName: z.string(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  segmentId: z.string().nullable().optional(),
  status: z.string(),
  version: z.number().int().nonnegative(),
  createdAt: z.string(),
});
