/**
 * Mock routes for BE sign-in: POST /identity/auth/login (5 per minute per IP in the BE; not
 * simulated) and GET /identity/me. Shapes follow `AuthTokenResponse` (token only) and
 * `MeResponse`; a wrong username or password is 401 UNAUTHORIZED without saying which.
 *
 * Demo accounts: the mock customer signs in with MOCK_CUSTOMER_LOGIN; any staff e-mail of the
 * legacy mock data signs in with MOCK_PASSWORD and gets a staff token, which the storefront refuses.
 */

import type { AxiosRequestConfig } from "axios";

import { registerMockRoute } from "./mock-adapter";

export const MOCK_PASSWORD = "CurrentPass123";
export const MOCK_CUSTOMER_LOGIN = {
  email: "nam.nguyen@example.vn",
  userId: "USER-CUS-0010",
  fullName: "Nguyễn Hoài Nam",
} as const;
const TTL_SECONDS = 8 * 60 * 60;

// UTF-8 safe, like a real JWT: a Vietnamese name is not Latin-1, and btoa alone would throw.
const b64url = (value: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A JWT-shaped token (unsigned) with the claims the mock `/identity/me` reads back. */
export function mockToken(claims: {
  sub: string;
  email: string;
  fullName: string;
  roles: string[];
}) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ ...claims, iat: now, exp: now + TTL_SECONDS })}.mock`;
}

const respond = (status: number, data: unknown) => ({ status, data, headers: {} });
const envelope = (data: unknown) =>
  respond(200, { success: true, data, timestamp: new Date().toISOString() });
const failure = (status: number, errorCode: string, message: string) =>
  respond(status, {
    success: false,
    errorCode,
    message,
    correlationId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });

function bodyOf(config: AxiosRequestConfig): Record<string, unknown> {
  const raw: unknown = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function claimsOf(config: AxiosRequestConfig) {
  const headers = config.headers as unknown as
    { get?: (name: string) => unknown; Authorization?: unknown } | undefined;
  const header = String(headers?.get?.("Authorization") ?? headers?.Authorization ?? "");
  const payload = header.replace(/^Bearer /, "").split(".")[1];
  if (!payload) return undefined;
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as {
      sub: string;
      email: string;
      fullName: string;
      roles: string[];
    };
  } catch {
    return undefined;
  }
}

export function registerAuthMockRoutes(
  staff: ReadonlyArray<{ userId: string; email: string; fullName: string }>,
) {
  registerMockRoute("POST", "/identity/auth/login", (config) => {
    const { username, password } = bodyOf(config);
    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return failure(400, "VALIDATION_FAILED", "username and password are required");
    }
    const email = username.trim().toLowerCase();
    const account =
      email === MOCK_CUSTOMER_LOGIN.email
        ? { ...MOCK_CUSTOMER_LOGIN, sub: MOCK_CUSTOMER_LOGIN.userId, roles: ["CUSTOMER"] }
        : staff
            .filter((user) => user.email.toLowerCase() === email)
            .map((user) => ({ ...user, sub: user.userId, roles: ["SALES_STAFF"] }))[0];
    if (!account || password !== MOCK_PASSWORD) {
      return failure(401, "UNAUTHORIZED", "Invalid username or password");
    }
    return envelope({
      accessToken: mockToken({
        sub: account.sub,
        email: account.email,
        fullName: account.fullName,
        roles: account.roles,
      }),
      tokenType: "Bearer",
      expiresInSeconds: TTL_SECONDS,
    });
  });

  registerMockRoute("GET", "/identity/me", (config) => {
    const claims = claimsOf(config);
    if (!claims) return failure(401, "UNAUTHORIZED", "Not authenticated");
    return envelope({
      userId: claims.sub,
      username: claims.email,
      email: claims.email,
      fullName: claims.fullName,
      status: "ACTIVE",
      roles: claims.roles,
      mustChangePassword: false,
    });
  });
}
