import { z } from "zod";

import { newPasswordSchema } from "@/lib/auth/password-policy";

const passwordPolicy = newPasswordSchema;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: passwordPolicy,
    confirmNewPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
    logoutOtherDevices: z.boolean(),
  })
  .refine((values) => values.newPassword === values.confirmNewPassword, {
    path: ["confirmNewPassword"],
    message: "Mật khẩu xác nhận không khớp",
  });

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordPolicy,
  logoutOtherDevices: z.boolean(),
});

export const passwordChangeResponseSchema = z.object({
  revokedSessions: z.number().int().nonnegative(),
});

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type PasswordChangeResponse = z.infer<typeof passwordChangeResponseSchema>;
