/**
 * Axios HTTP client — single instance for the entire app.
 *
 * Interceptors:
 *  - Request: attach JWT token (Authorization: Bearer) + warehouse header.
 *  - Response: unwrap the backend ApiResponse envelope and normalise errors.
 *    On 401 → logout and redirect; there is no refresh-token flow.
 *
 * When USE_MOCK=true the mock adapter (mock-adapter.ts) replaces the default
 * adapter so every call resolves against the mock route table; otherwise, with
 * DESIGN_USE_MOCK on, it serves the design API only and every other call reaches
 * the BE — component code stays identical either way.
 *
 * Base URL is always same-origin "/api" — the real backend URL (API_URL) is
 * server-only and never inlined into the client bundle. next.config.ts
 * rewrites "/api/:path*" to the real backend on the server side.
 */

import axios, { type AxiosError, type AxiosResponse } from "axios";
import { readBlobErrorBody } from "./blob-error";
import { ApiError, type ApiErrorBody } from "./error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { isTokenExpired } from "@/lib/auth/jwt";
import { endSession, redirectToLogin } from "@/lib/auth/session";
import { useAppStore } from "@/lib/store/use-app-store";

/**
 * Language of the BE's `message` / `fieldErrors[].message` (BE `I18nConfig`, AcceptHeaderLocaleResolver). The
 * storefront is Vietnamese only, so every call says `vi` instead of passing on the browser's language: through the
 * /api rewrite an en-US browser used to get English errors (WF-02 audit, item 3).
 */
export const BACKEND_ACCEPT_LANGUAGE = "vi";

export const api = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json", "Accept-Language": BACKEND_ACCEPT_LANGUAGE },
});

/* ── Request interceptor ─────────────────────────────────────────────── */

/**
 * Anonymous BE endpoints. They get no bearer: a stale token on a permitAll route is still run
 * through the resource-server filter, which answers 401 for it before the endpoint is reached.
 */
const ANONYMOUS_PATHS = [
  "/identity/auth/login",
  "/customers/portal-activation",
  // The lead form (KE-HOACH sales owner §10.3): a visitor, or a signed-in customer asking for another company.
  "/public/leads",
];
const isAnonymous = (url: string | undefined) =>
  /^\/public\/contract-verifications\/[^/]+(?:\/check)?$/.test((url ?? "").split("?")[0] ?? "") ||
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
  data?: unknown;
}

function isApiSuccessEnvelope(value: unknown): value is ApiSuccessEnvelope {
  return (
    typeof value === "object" && value !== null && "success" in value && value.success === true
  );
}

/**
 * BE bỏ trường null khỏi JSON (Jackson non_null): `{success: true}` không có `data` nghĩa là `data: null`, không phải
 * envelope để đem đi parse.
 */
function unwrapSuccess(response: AxiosResponse<unknown>): AxiosResponse<unknown> {
  if (isApiSuccessEnvelope(response.data))
    response.data = "data" in response.data ? response.data.data : null;
  return response;
}

function logoutAfterUnauthorized(): void {
  endSession();
  redirectToLogin();
}

api.interceptors.response.use(unwrapSuccess, async (err: AxiosError<ApiErrorBody> | ApiError) => {
  // Already ours (the request interceptor refused an expired token): not an HTTP failure to translate.
  if (err instanceof ApiError) return Promise.reject(err);
  // A wrong password is also 401, but it is the login form's to show: not a lost session. Nor is a 401 to a visitor
  // who never signed in (no bearer was sent): the public home page must not bounce them to the login page.
  const sentToken = Boolean(err.config?.headers?.Authorization);
  if (err.response?.status === 401 && !isAnonymous(err.config?.url) && sentToken) {
    logoutAfterUnauthorized();
  }
  // A failed file download carries its JSON envelope as a Blob: read it so the BE's code and message survive.
  if (err.config?.responseType === "blob" && err.response?.data instanceof Blob) {
    err.response.data = (await readBlobErrorBody(err.response.data)) as ApiErrorBody;
  }
  return Promise.reject(ApiError.from(err));
});
