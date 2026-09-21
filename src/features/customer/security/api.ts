import { api } from "@/lib/api/client";

import {
  changePasswordRequestSchema,
  passwordChangeResponseSchema,
  type ChangePasswordRequest,
  type PasswordChangeResponse,
} from "./schemas";

export async function changePassword(
  input: ChangePasswordRequest,
): Promise<PasswordChangeResponse> {
  const body = changePasswordRequestSchema.parse(input);
  const { data } = await api.put<unknown>("/v1/identity/auth/password", body);
  return passwordChangeResponseSchema.parse(data);
}
