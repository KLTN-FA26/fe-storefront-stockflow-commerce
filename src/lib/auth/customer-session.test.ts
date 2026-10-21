import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useCartStore } from "@/lib/store/use-cart-store";

import { NotCustomerError, signInCustomer, signOutCustomer } from "./customer-session";
import { STOREFRONT_PERMISSIONS } from "./permission-codes";
import { useAuthStore } from "./auth-store";
import { registerSessionQueryClient } from "./session";

const CUSTOMER_ID = "c0ffee00-0000-4000-8000-000000000010";
const tokenResponse = { accessToken: "tok", tokenType: "Bearer", expiresInSeconds: 3600 };
// A role's NAME decides nothing: what an account may do is the permission list the BE sends.
const CUSTOMER_PERMISSIONS = [...STOREFRONT_PERMISSIONS, "sales-orders:UPDATE"];
const STAFF_PERMISSIONS = ["sales-orders:READ", "sales-orders:CREATE", "customer-customers:READ"];
const myPermissions = (permissions: readonly string[], roles: string[] = ["ANY_ROLE_NAME"]) => ({
  roles,
  permissions,
  dataScope: "OWN",
});
const me = (roles: string[], extra: Record<string, unknown> = {}) => ({
  userId: "11111111-1111-4111-8111-111111111111",
  username: "nam@example.vn",
  email: "nam@example.vn",
  fullName: "Nguyễn Hoài Nam",
  status: "ACTIVE",
  roles,
  ...extra,
});

function backend(
  opts: {
    roles?: string[];
    permissions?: readonly string[];
    meExtra?: Record<string, unknown>;
    customers?: () => unknown;
  } = {},
) {
  const calls: string[] = [];
  vi.spyOn(api, "post").mockImplementation(async (url, _body, config) => {
    calls.push(`POST ${url}`);
    if (url === "/identity/auth/logout")
      expect(config?.headers).toEqual({ Authorization: "Bearer tok" });
    if (url === "/identity/auth/login") return { data: tokenResponse };
    return { data: undefined };
  });
  vi.spyOn(api, "get").mockImplementation(async (url, config) => {
    calls.push(`GET ${url}`);
    // The new token rides on the request; it is not stored until the account is accepted.
    expect(config?.headers).toEqual({ Authorization: "Bearer tok" });
    expect(useAuthStore.getState().tokens).toBeNull();
    if (url === "/identity/me") return { data: me(opts.roles ?? ["CUSTOMER"], opts.meExtra) };
    if (url === "/identity/me/permissions") {
      return { data: myPermissions(opts.permissions ?? CUSTOMER_PERMISSIONS, opts.roles) };
    }
    if (url === "/customers/me") return { data: opts.customers?.() ?? { customerId: CUSTOMER_ID } };
    throw new Error(`unexpected ${url}`);
  });
  return calls;
}

beforeEach(() => {
  useAuthStore.getState().logout();
  useCartStore.setState({ ownerId: null, lines: [] });
});
afterEach(() => vi.restoreAllMocks());

describe("signInCustomer", () => {
  it("logs in, reads who it is and the customer profile, then stores the user", async () => {
    const calls = backend();
    await expect(signInCustomer({ username: "nam@example.vn", password: "pw" })).resolves.toEqual({
      mustChangePassword: false,
    });

    expect(calls).toEqual([
      "POST /identity/auth/login",
      "GET /identity/me",
      "GET /identity/me/permissions",
      "GET /customers/me",
    ]);
    expect(api.post).toHaveBeenCalledWith("/identity/auth/login", {
      username: "nam@example.vn",
      password: "pw",
    });
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      tokens: { accessToken: "tok" },
      user: {
        userId: me([]).userId,
        customerId: CUSTOMER_ID,
        fullName: "Nguyễn Hoài Nam",
        email: "nam@example.vn",
      },
    });
  });

  it("binds the cart to the customer profile, so another customer never inherits the lines", async () => {
    useCartStore.setState({
      ownerId: "someone-else",
      lines: [{ sku: "A", slug: "a", title: "A", quantity: 1 }],
    });
    backend();
    await signInCustomer({ username: "u", password: "p" });
    expect(useCartStore.getState()).toMatchObject({ ownerId: CUSTOMER_ID, lines: [] });
  });

  it("keeps lines added before signing in (nobody owned them yet)", async () => {
    useCartStore.setState({
      ownerId: null,
      lines: [{ sku: "A", slug: "a", title: "A", quantity: 1 }],
    });
    backend();
    await signInCustomer({ username: "u", password: "p" });
    expect(useCartStore.getState().lines).toHaveLength(1);
  });

  it("lets in any account that holds the storefront permissions, whatever its role is called", async () => {
    backend({ roles: ["WHOLESALE_PARTNER"] });
    await expect(signInCustomer({ username: "u", password: "p" })).resolves.toEqual({
      mustChangePassword: false,
    });
  });

  it("refuses an account that is a CUSTOMER by name but lacks a storefront permission", async () => {
    for (const missing of STOREFRONT_PERMISSIONS) {
      vi.restoreAllMocks();
      backend({
        roles: ["CUSTOMER"],
        permissions: CUSTOMER_PERMISSIONS.filter((code) => code !== missing),
      });
      await expect(signInCustomer({ username: "u", password: "p" })).rejects.toBeInstanceOf(
        NotCustomerError,
      );
    }
  });

  it("refuses a staff account and signs it out again, at the BE too", async () => {
    const calls = backend({ roles: ["SALES_STAFF"], permissions: STAFF_PERMISSIONS });
    await expect(signInCustomer({ username: "staff", password: "p" })).rejects.toBeInstanceOf(
      NotCustomerError,
    );

    expect(calls).not.toContain("GET /customers/me");
    expect(calls).toContain("POST /identity/auth/logout");
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      tokens: null,
      user: null,
    });
    expect(useCartStore.getState().ownerId).toBeNull();
  });

  it("never shows a staff account as signed in, not even for a moment", async () => {
    const seen: boolean[] = [];
    const unsubscribe = useAuthStore.subscribe((state) => seen.push(state.isAuthenticated));
    backend({ roles: ["SALES_STAFF"], permissions: STAFF_PERMISSIONS });
    await signInCustomer({ username: "staff", password: "p" }).catch(() => undefined);
    unsubscribe();
    expect(seen).not.toContain(true);
  });

  it("refuses a CUSTOMER login that has no customer profile, and leaves nothing half signed in", async () => {
    vi.spyOn(api, "post").mockImplementation(async (url) => ({
      data: url === "/identity/auth/login" ? tokenResponse : undefined,
    }));
    vi.spyOn(api, "get").mockImplementation(async (url) => {
      if (url === "/identity/me") return { data: me(["CUSTOMER"]) };
      if (url === "/identity/me/permissions") return { data: myPermissions(CUSTOMER_PERMISSIONS) };
      throw new ApiError(404, "CUSTOMER_NOT_FOUND", "Customer not found");
    });
    await expect(signInCustomer({ username: "u", password: "p" })).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("passes a wrong password through untouched and stores nothing", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "Invalid username or password"),
    );
    await expect(signInCustomer({ username: "u", password: "bad" })).rejects.toMatchObject({
      status: 401,
    });
    expect(useAuthStore.getState().tokens).toBeNull();
  });

  it("tells the caller when an administrator set the password", async () => {
    backend({ meExtra: { mustChangePassword: true } });
    await expect(signInCustomer({ username: "u", password: "p" })).resolves.toEqual({
      mustChangePassword: true,
    });
  });

  it("rejects a /identity/me answer that breaks the contract", async () => {
    vi.spyOn(api, "post").mockResolvedValue({ data: tokenResponse });
    vi.spyOn(api, "get").mockResolvedValue({ data: { fullName: "x" } }); // no userId
    await expect(signInCustomer({ username: "u", password: "p" })).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe("signOutCustomer", () => {
  it("ends the BE session, drops token and user, empties the query cache and the cart", async () => {
    const client = new QueryClient();
    client.setQueryData(["orders", "list"], { items: ["private"] });
    registerSessionQueryClient(client);
    useAuthStore.getState().login(
      {
        userId: "u",
        customerId: CUSTOMER_ID,
        fullName: "A",
        email: "a@x.vn",
        roles: [],
        warehouseIds: [],
      },
      tokenResponse,
    );
    useCartStore.setState({
      ownerId: CUSTOMER_ID,
      lines: [{ sku: "A", slug: "a", title: "A", quantity: 1 }],
    });
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: undefined });

    await signOutCustomer();

    expect(post).toHaveBeenCalledWith("/identity/auth/logout");
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      tokens: null,
      user: null,
    });
    expect(client.getQueryData(["orders", "list"])).toBeUndefined();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  it("still signs out locally when the BE cannot be reached", async () => {
    useAuthStore.getState().login(null, tokenResponse);
    vi.spyOn(api, "post").mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "offline"));
    await signOutCustomer();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
