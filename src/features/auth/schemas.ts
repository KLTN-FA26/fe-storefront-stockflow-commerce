import { z } from "zod";

import { newPasswordSchema } from "@/lib/auth/password-policy";

// BE LoginRequest: both fields @NotBlank. A customer signs in with the username of their account (the seed's
// `demo.khachhang`), which need not be an e-mail: the field is plain text (WF-02 audit).
// The password is sent as typed (no trim): a space can be part of it, and the BE checks the rest.
export const loginFormSchema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

/**
 * Portal activation (BE `POST /customers/portal-activation`, SCRUM-450): the contact Sales invited sets the password
 * of the account the invitation names. The confirmation is the form's alone; only the password is sent.
 */
export const activationFormSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string().min(1, "Vui lòng nhập lại mật khẩu"),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu nhập lại không khớp",
  });

export type ActivationFormValues = z.infer<typeof activationFormSchema>;

/** BE `ActivatePortalAccountRequest`: token ≤ 128, password ≤ 72, both @NotBlank. Sent in the body, never the URL. */
export const activationRequestSchema = z.object({
  token: z.string().min(1).max(128),
  password: newPasswordSchema,
});

export type ActivationRequest = z.infer<typeof activationRequestSchema>;

/** BE `PortalActivationResponse`: the e-mail the account now signs in with (it is also the username). No token. */
export const activationResponseSchema = z.object({ email: z.string().min(1) });
