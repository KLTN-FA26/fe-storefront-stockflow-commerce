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
import { APP_ROUTES } from "@/constants";
import { ApiError, type ApiErrorBody } from "./error";
import { useAuthStore } from "@/lib/auth/auth-store";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

/* ── Request interceptor ─────────────────────────────────────────────── */

api.interceptors.request.use((cfg) => {
  try {
    // Auth token — require() to avoid circular dependency at module init
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore } = require("@/lib/auth/auth-store");
    const tokens = useAuthStore.getState().tokens;
    if (tokens?.accessToken) {
      cfg.headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }

    // Warehouse header
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAppStore } = require("@/lib/store/use-app-store");
    const wh = useAppStore.getState().warehouseId;
    if (wh) cfg.headers.set("X-Warehouse-Id", wh);
  } catch {
    // Store not initialised yet (SSR / test) — skip.
  }
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
  useAuthStore.getState().logout();

  if (typeof window !== "undefined") window.location.replace(APP_ROUTES.login);
}

api.interceptors.response.use(unwrapSuccess, (err: AxiosError<ApiErrorBody>) => {
  if (err.response?.status === 401) logoutAfterUnauthorized();
  return Promise.reject(ApiError.from(err));
});
