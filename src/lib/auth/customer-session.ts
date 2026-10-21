import { z } from "zod";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useCartStore } from "@/lib/store/use-cart-store";

import { loginApi, logoutApi, type LoginRequest } from "./auth-api";
import { useAuthStore } from "./auth-store";
import { getMyPermissions } from "./my-permissions";
import { holdsAll, STOREFRONT_PERMISSIONS } from "./permission-codes";
import { endSession } from "./session";

/** BE MeResponse (GET /identity/me): the login response carries only a token. Role names are not read. */
const meSchema = z.object({
  userId: z.string().min(1),
  fullName: z.string().nullish(),
  email: z.string().nullish(),
  // The password was set by an administrator: ask for a new one first.
  mustChangePassword: z.boolean().nullish(),
});

// Only the id: other /customers/me fields may be omitted by the BE (NON_NULL).
const customerIdentitySchema = z.object({ customerId: z.string().min(1) });

/** An account that does not hold the storefront's permissions: the portal is not for it (a staff account). */
export class NotCustomerError extends Error {
  constructor() {
    super("NOT_CUSTOMER");
    this.name = "NotCustomerError";
  }
}

export interface SignInResult {
  /** An admin-set password: the customer should change it before anything else. */
  mustChangePassword: boolean;
}

/**
 * Sign a customer in, in the order the BE needs:
 *  1. POST /identity/auth/login (5 per minute per IP) → a bearer token and nothing else;
 *  2. GET /identity/me → who it is; GET /identity/me/permissions → what it may do: only an account
 *     holding the storefront's permissions (permission-codes.ts) may use it, whatever its roles are called;
 *  3. GET /customers/me → the customer profile id, which owns the cart and the orders.
 * Steps 2 and 3 carry the new token explicitly and it is stored only once both have passed:
 * storing it first would make the login page (and every screen) see a signed-in customer while a
 * staff account is still being turned away.
 */
export async function signInCustomer(credentials: LoginRequest): Promise<SignInResult> {
  const tokens = await loginApi(credentials);
  const headers = { Authorization: `Bearer ${tokens.accessToken}` };
  try {
    const me = meSchema.parse((await api.get<unknown>("/identity/me", { headers })).data);
    const { permissions } = await getMyPermissions({ headers });
    if (!holdsAll(permissions, STOREFRONT_PERMISSIONS)) throw new NotCustomerError();
    const { customerId } = customerIdentitySchema.parse(
      (
        await api.get<unknown>("/customers/me", { headers }).catch((error: unknown) => {
          // Holding every permission (a system administrator) is not being a customer: no profile
          // right after sign-in means this is not a customer account, whatever the permissions say.
          if (error instanceof ApiError && error.code === "CUSTOMER_NOT_FOUND") {
            throw new NotCustomerError();
          }
          throw error;
        })
      ).data,
    );
    // Before the user is set: nothing may render a cart that is not this customer's.
    useCartStore.getState().bindOwner(customerId);
    useAuthStore.getState().login(
      {
        userId: me.userId,
        customerId,
        fullName: me.fullName ?? me.email ?? "",
        email: me.email ?? "",
        roles: [],
        warehouseIds: [],
      },
      tokens,
    );
    return { mustChangePassword: me.mustChangePassword === true };
  } catch (error) {
    // A refused account must not keep a live session at the BE. (A 401 means the token was not
    // accepted at all: nothing to end.)
    if (!(error instanceof ApiError && error.status === 401)) await logoutApi(tokens.accessToken);
    throw error;
  }
}

/** Customer-initiated sign-out: the session at the BE, the token, cached data and the cart. */
export async function signOutCustomer(): Promise<void> {
  await logoutApi();
  endSession({ clearCart: true });
}
