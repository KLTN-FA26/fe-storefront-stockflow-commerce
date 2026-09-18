import { z } from "zod";

export const addressSchema = z.object({
  recipientName: z.string().min(1, "Tên người nhận là bắt buộc"),
  recipientPhone: z
    .string()
    .min(1, "Số điện thoại là bắt buộc")
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, "Số điện thoại không hợp lệ"),
  line1: z.string().min(1, "Địa chỉ chi tiết là bắt buộc"),
  ward: z.string().min(1, "Phường/Xã là bắt buộc"),
  city: z.string().optional(), // Một số khu vực có thành phố thuộc tỉnh, nhưng đa phần là optional
  province: z.string().min(1, "Tỉnh/Thành phố là bắt buộc"),
  country: z.string().default("Vietnam"),
  postalCode: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export type AddressFormValues = z.infer<typeof addressSchema>;
