/**
 * Auth API — access-token login/logout and mock-login support.
 *
 * All requests use the canonical API client so mock mode stays behind the
 * adapter boundary and production requests share the same error handling.
 */

import { api } from "@/lib/api/client";
import { z } from "zod";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  expiresInSeconds: z.number().finite().positive(),
});

export async function loginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/identity/auth/login", credentials);
  return loginResponseSchema.parse(data);
}

/** `accessToken`: end a session whose token is not stored (yet, or any more), e.g. a refused sign-in. */
export async function logoutApi(accessToken?: string): Promise<void> {
  try {
    if (accessToken) {
      await api.post("/identity/auth/logout", undefined, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } else {
      await api.post("/identity/auth/logout");
    }
  } catch {
    // Local logout must still complete when the server is unavailable.
  }
}

export async function mockLoginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/identity/auth/login", credentials);
  return loginResponseSchema.parse(data);
}
