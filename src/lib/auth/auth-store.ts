/**
 * Auth store — zustand with persist.
 *
 * Stores JWT tokens received from Spring Boot backend.
 * Token is attached to every axios request via interceptor in client.ts.
 *
 * Flow:
 *   1. User submits credentials → POST /api/auth/login (Spring Boot)
 *   2. Spring Boot returns { accessToken, refreshToken, user }
 *   3. FE stores tokens here → axios interceptor attaches Authorization header
 *   4. On 401 → try refresh token → if fail → logout + redirect /login
 *   5. Next.js middleware checks token existence → redirect if missing
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RoleName } from "./roles";
import { setAuthCookie, removeAuthCookie } from "./auth-cookie";

/* ── Types ───────────────────────────────────────────────────────────── */

export interface AuthUser {
  userId: string;
  fullName: string;
  email: string;
  roles: RoleName[];
  warehouseIds: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  /* ── Data ────────────────────────────────────────────────────────── */
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;

  /* ── Role impersonation (dev/demo only) ─────────────────────────── */
  impersonatedRole: RoleName | null;
  setImpersonatedRole: (r: RoleName | null) => void;

  /* ── Effective roles (respects impersonation) ───────────────────── */
  effectiveRoles: () => RoleName[];

  /* ── Actions ────────────────────────────────────────────────────── */
  login: (user: AuthUser, tokens: AuthTokens) => void;
  updateTokens: (tokens: AuthTokens) => void;
  logout: () => void;
}

/* ── Store ────────────────────────────────────────────────────────────── */

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tokens: null,
      isAuthenticated: false,

      impersonatedRole: null,
      setImpersonatedRole: (r) => set({ impersonatedRole: r }),

      effectiveRoles: () => {
        const { user, impersonatedRole } = get();
        if (!user) return [];
        if (impersonatedRole) return [impersonatedRole];
        return user.roles;
      },

      login: (user, tokens) => {
        setAuthCookie(tokens.accessToken);
        set({ user, tokens, isAuthenticated: true, impersonatedRole: null });
      },

      updateTokens: (tokens) => {
        setAuthCookie(tokens.accessToken);
        set({ tokens });
      },

      logout: () => {
        removeAuthCookie();
        set({
          user: null,
          tokens: null,
          isAuthenticated: false,
          impersonatedRole: null,
        });
      },
    }),
    {
      name: "stockflow-auth",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
        // Don't persist impersonatedRole — reset on page refresh
      }),
    },
  ),
);
