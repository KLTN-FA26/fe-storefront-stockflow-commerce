/**
 * Axios HTTP client — single instance for the entire app.
 *
 * Interceptors:
 *  - Request: attach JWT token (Authorization: Bearer) + warehouse header.
 *  - Response: unwrap the backend ApiResponse envelope and normalise errors.
 *    On 401 → logout and redirect; there is no refresh-token flow.
 *
 * When USE_MOCK=true the mock adapter (mock-adapter.ts) replaces
 * the default adapter so every call resolves against mock-data — component
 * code stays identical.
 *
 * Base URL is always same-origin "/api" — the real backend URL (API_URL) is
 * server-only and never inlined into the client bundle. next.config.ts
 * rewrites "/api/:path*" to the real backend on the server side.
 */

import axios, { type AxiosError, type AxiosResponse } from "axios";
import { ApiError, type ApiErrorBody } from "./error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { isTokenExpired } from "@/lib/auth/jwt";
import { endSession, redirectToLogin } from "@/lib/auth/session";
import { useAppStore } from "@/lib/store/use-app-store";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

/* ── Request interceptor ─────────────────────────────────────────────── */

/**
 * Anonymous BE endpoints. They get no bearer: a stale token on a permitAll route is still run
 * through the resource-server filter, which answers 401 for it before the endpoint is reached.
 */
const ANONYMOUS_PATHS = ["/identity/auth/login", "/customers/portal-activation"];
const isAnonymous = (url: string | undefined) =>
  ANONYMOUS_PATHS.some((path) => (url ?? "").split("?")[0] === path);

api.interceptors.request.use((cfg) => {
  if (isAnonymous(cfg.url)) return cfg;
  const token = useAuthStore.getState().tokens?.accessToken;
  if (token && isTokenExpired(token)) {
    // Do not send a token the BE would refuse: sign out and come back here after signing in.
    endSession();
    redirectToLogin();
    return Promise.reject(
      new ApiError(401, "TOKEN_EXPIRED", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
    );
  }
  // The stores are plain imports: client.ts is only reached from the browser at request time, and
  // the auth store no longer imports anything that imports this file.
  if (token) cfg.headers.set("Authorization", `Bearer ${token}`);
  const warehouse = useAppStore.getState().warehouseId;
  if (warehouse) cfg.headers.set("X-Warehouse-Id", warehouse);
  return cfg;
});

/* ── Response interceptor ────────────────────────────────────────────── */

interface ApiSuccessEnvelope {
  success: true;
  data: unknown;
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    value.success === true &&
    "data" in value
  );
}

function unwrapSuccess(response: AxiosResponse<unknown>): AxiosResponse<unknown> {
  if (isApiSuccessEnvelope(response.data)) response.data = response.data.data;
  return response;
}

function logoutAfterUnauthorized(): void {
  endSession();
  redirectToLogin();
}

api.interceptors.response.use(unwrapSuccess, (err: AxiosError<ApiErrorBody> | ApiError) => {
  // Already ours (the request interceptor refused an expired token): not an HTTP failure to translate.
  if (err instanceof ApiError) return Promise.reject(err);
  // A wrong password is also 401, but it is the login form's to show: not a lost session.
  if (err.response?.status === 401 && !isAnonymous(err.config?.url)) logoutAfterUnauthorized();
  return Promise.reject(ApiError.from(err));
});
