import { z } from "zod";

// BE LoginRequest: both fields @NotBlank. A customer signs in with the username of their account (the seed's
// `demo.khachhang`), which need not be an e-mail: the field is plain text (WF-02 audit).
// The password is sent as typed (no trim): a space can be part of it, and the BE checks the rest.
export const loginFormSchema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
