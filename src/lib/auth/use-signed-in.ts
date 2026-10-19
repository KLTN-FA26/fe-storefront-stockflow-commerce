"use client";

import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMock } from "@/providers/app-providers";

import { useAuthStore } from "./auth-store";
import { isTokenExpired } from "./jwt";

/**
 * Whether the browser holds a usable session. `undefined` until the client has hydrated — the
 * token lives in localStorage, so the server cannot know, and guessing would flash the wrong UI.
 * Mock mode is not special-cased here: the login page needs the truth to be testable in mock mode.
 */
export function useHasSession(): boolean | undefined {
  const hydrated = useHydrated();
  // A token whose own `exp` has passed is as good as none: the BE would answer 401.
  const hasToken = useAuthStore(
    (state) =>
      state.isAuthenticated &&
      !!state.tokens?.accessToken &&
      !isTokenExpired(state.tokens.accessToken),
  );
  return hydrated ? hasToken : undefined;
}

/**
 * Whether to show screens the BE only serves to signed-in callers (catalog, prices, stock:
 * kltn-docs 13 BR-02). Mock mode answers every call without a login, so it counts as signed in.
 */
export function useSignedIn(): boolean | undefined {
  const isMock = useIsMock();
  const session = useHasSession();
  return session === undefined ? undefined : isMock || session;
}
