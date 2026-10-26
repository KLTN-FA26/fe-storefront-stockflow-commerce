import type { QueryClient } from "@tanstack/react-query";

import { useCartStore } from "@/lib/store/use-cart-store";

import { useAuthStore } from "./auth-store";
import { loginUrl } from "./safe-next";
import { clearSignedInStorage } from "./signed-in-storage";

/**
 * Ending a session is more than dropping the token: what the previous customer loaded (orders,
 * prices, addresses) must not survive in the query cache for the next sign-in. The app registers
 * its query client here once; the API client's 401 handling has no access to React context.
 */
let queryClient: QueryClient | null = null;
export function registerSessionQueryClient(client: QueryClient): void {
  queryClient = client;
}

/**
 * Forget the signed-in customer: token, user, cached server data. The cart and what the customer
 * left in this browser for themselves (`signedInStorageKey`: unsent drafts) go too only when the
 * customer chose to sign out; when a session merely expired, the same customer will sign in again
 * and keeps their lines and drafts (a different customer never inherits the lines: see `bindOwner`;
 * a draft is only offered over a design its owner opens).
 */
export function endSession(options: { clearCart: boolean } = { clearCart: false }): void {
  useAuthStore.getState().logout();
  queryClient?.clear();
  if (options.clearCart) {
    useCartStore.getState().clear();
    clearSignedInStorage();
  }
}

/** To the login page, remembering where the customer was; a no-op when already on it. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login" || pathname.startsWith("/login/")) return;
  window.location.replace(loginUrl(`${pathname}${search}`));
}
