/**
 * Auth API — access-token login/logout and mock-login support.
 *
 * All requests use the canonical API client so mock mode stays behind the
 * adapter boundary and production requests share the same error handling.
 */

import { api } from "@/lib/api/client";

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

export async function loginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/v1/identity/auth/login", credentials);
  return data;
}

export async function logoutApi(): Promise<void> {
  try {
    await api.post("/v1/identity/auth/logout");
  } catch {
    // Local logout must still complete when the server is unavailable.
  }
}

export async function mockLoginApi(credentials: LoginRequest): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/v1/identity/auth/login", credentials);
  return data;
}
