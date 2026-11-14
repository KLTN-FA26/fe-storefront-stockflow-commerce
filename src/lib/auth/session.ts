import type { QueryClient } from "@tanstack/react-query";

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
 * Forget the signed-in customer: token, user, cached server data. What the customer left in this
 * browser for themselves (`signedInStorageKey`: unsent drafts) goes too only when the customer chose
 * to sign out; when a session merely expired, the same customer will sign in again and keeps their
 * drafts (a draft is only offered over a design its owner opens). There is no cart any more: the
 * customer does not order on the portal (kltn-docs 14).
 */
export function endSession(options: { forgetDrafts: boolean } = { forgetDrafts: false }): void {
  useAuthStore.getState().logout();
  queryClient?.clear();
  if (options.forgetDrafts) clearSignedInStorage();
}

/** To the login page, remembering where the customer was; a no-op when already on it. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login" || pathname.startsWith("/login/")) return;
  window.location.replace(loginUrl(`${pathname}${search}`));
}
