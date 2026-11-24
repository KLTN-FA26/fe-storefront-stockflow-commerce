import { z } from "zod";

/**
 * A new password, as the BE's identity `PasswordPolicy` accepts it: 10–72 characters (72 is bcrypt's limit) with an
 * upper-case letter, a lower-case letter and a digit. One schema for every form that sets a password (password
 * change, portal activation), so they cannot drift apart. The BE checks again.
 */
export const newPasswordSchema = z
  .string()
  .min(10, "Mật khẩu phải có ít nhất 10 ký tự")
  .max(72, "Mật khẩu tối đa 72 ký tự")
  .regex(/[A-Z]/, "Mật khẩu phải có ít nhất một chữ hoa")
  .regex(/[a-z]/, "Mật khẩu phải có ít nhất một chữ thường")
  .regex(/\d/, "Mật khẩu phải có ít nhất một chữ số");
