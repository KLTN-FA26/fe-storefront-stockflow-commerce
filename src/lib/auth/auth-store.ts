/**
 * Auth store — zustand with persist.
 *
 * Stores the access token received from the Spring Boot backend.
 * Token is attached to every axios request via interceptor in client.ts.
 *
 * Flow:
 *   1. User submits credentials → POST /api/v1/identity/auth/login
 *   2. Spring Boot returns { accessToken, tokenType, expiresInSeconds }
 *   3. FE stores the access token → axios interceptor attaches Authorization header
 *   4. On 401 → logout + redirect /login; server sessions are the revocation source of truth
 *   5. Next.js middleware checks token existence → redirect if missing
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { setAuthCookie, removeAuthCookie } from "./auth-cookie";

/* ── Types ───────────────────────────────────────────────────────────── */

export interface AuthUser {
  userId: string;
  /** The customer profile (GET /customers/me) behind a storefront sign-in; owns the cart and orders. */
  customerId?: string | undefined;
  fullName: string;
  email: string;
  /** Role names as the BE reports them: display only, never a basis for access (see permission-codes.ts). */
  roles: string[];
  warehouseIds: string[];
}

export interface AuthTokens {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
}

interface AuthState {
  /* ── Data ────────────────────────────────────────────────────────── */
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;

  /* ── Actions ────────────────────────────────────────────────────── */
  login: (user: AuthUser | null, tokens: AuthTokens) => void;
  logout: () => void;
}

/* ── Store ────────────────────────────────────────────────────────────── */

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,

      login: (user, tokens) => {
        setAuthCookie(tokens.accessToken);
        set({ user, tokens, isAuthenticated: true });
      },

      logout: () => {
        removeAuthCookie();
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "stockflow-auth",
      version: 1,
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      migrate: (persisted) => {
        const state = persisted as Partial<AuthState> & {
          tokens?: Partial<AuthTokens> & { refreshToken?: unknown };
        };
        const rawTokens = state.tokens;
        if (!rawTokens?.accessToken) {
          return { user: null, tokens: null, isAuthenticated: false };
        }
        return {
          user: state.user ?? null,
          tokens: {
            accessToken: rawTokens.accessToken,
            tokenType: rawTokens.tokenType ?? "Bearer",
            expiresInSeconds: rawTokens.expiresInSeconds ?? 0,
          },
          isAuthenticated: state.isAuthenticated === true,
        };
      },
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
