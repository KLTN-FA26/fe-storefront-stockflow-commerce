import { useMutation } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api/error";

import { changePassword } from "./api";
import type { ChangePasswordRequest, PasswordChangeResponse } from "./types";

export function useChangePassword() {
  return useMutation<PasswordChangeResponse, ApiError, ChangePasswordRequest>({
    mutationFn: changePassword,
    retry: false,
  });
}
