/**
 * App providers — wraps all client-side context providers.
 *
 * Composed in root layout so every page has access to:
 *  - TanStack Query (server state)
 *  - nuqs (URL search params)
 *  - Toast
 *  - Auth session (added in Phase 0b)
 *  - Mock mode flags (read server-side from USE_MOCK / DESIGN_USE_MOCK, threaded via
 *    context — see `useIsMock`, `useIsDesignMock`)
 */

"use client";

import React, { createContext, useContext, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { makeQueryClient } from "@/lib/api/query-client";
import { activateDesignMockAdapter, activateMockAdapter } from "@/lib/api/mock-adapter";
import { registerSessionQueryClient } from "@/lib/auth/session";

const MockModeContext = createContext(false);
const DesignMockModeContext = createContext(false);

/** Whether the app is running against the mock adapter (server-derived, see `src/lib/config.ts`). */
export function useIsMock(): boolean {
  return useContext(MockModeContext);
}

/**
 * Whether the design API is served by the mock: the full mock (USE_MOCK) or the design-only one
 * (DESIGN_USE_MOCK), see `src/lib/config.ts`.
 */
export function useIsDesignMock(): boolean {
  return useContext(DesignMockModeContext);
}

export function AppProviders({
  children,
  isMock,
  isDesignMock = false,
}: {
  children: React.ReactNode;
  isMock: boolean;
  /** DESIGN_USE_MOCK; the full mock (`isMock`) serves the design API too. */
  isDesignMock?: boolean;
}) {
  const designMocked = isMock || isDesignMock;
  const [queryClient] = useState(() => {
    const client = makeQueryClient();
    registerSessionQueryClient(client); // so a sign-out or a lost session can empty the cache
    return client;
  });

  // Activate the mock adapter synchronously on first render, BEFORE any
  // child effect can fire a request. A `useEffect` here runs too late —
  // child effects fire before parent effects — so a child's mount effect
  // (e.g. login page loading mock users) would race ahead of activation and
  // hit the real (unset) adapter. The lazy useState initializer runs once,
  // during render, ahead of children. Guarded to the browser only — the
  // `api` axios instance is a module-level singleton shared with the
  // server, so this must never run during SSR/prerender.
  useState(() => {
    if (typeof window === "undefined") return;
    if (isMock) activateMockAdapter();
    else if (designMocked) activateDesignMockAdapter();
  });

  return (
    <MockModeContext.Provider value={isMock}>
      <DesignMockModeContext.Provider value={designMocked}>
        <QueryClientProvider client={queryClient}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </QueryClientProvider>
      </DesignMockModeContext.Provider>
    </MockModeContext.Provider>
  );
}
