import { z } from "zod";

// BE LoginRequest: both fields @NotBlank. The username of a customer is the e-mail Sales invited.
// The password is sent as typed (no trim): a space can be part of it, and the BE checks the rest.
export const loginFormSchema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập email đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
