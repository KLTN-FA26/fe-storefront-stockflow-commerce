/**
 * Server-side app config — single source for env-derived flags.
 *
 * USE_MOCK is server-only (no NEXT_PUBLIC_ prefix): it is read once here, in
 * a Server Component (root layout), and threaded down to client components
 * via context (see `MockModeProvider`/`useIsMock` in `providers/app-providers.tsx`).
 * Client code must never read `process.env.USE_MOCK` directly.
 */

export const IS_MOCK = process.env.USE_MOCK === "true";

/**
 * DESIGN_USE_MOCK=true keeps only the design module (Module 12) on its mock while every other call
 * reaches the real BE. Default off: the design module calls the BE's design API. Same rule as
 * USE_MOCK: server-only, read here once, threaded to client code by context (`useIsDesignMock`).
 */
export const DESIGN_USE_MOCK = process.env.DESIGN_USE_MOCK === "true";

/** Whether the design API is served by the mock: the full mock, or the design-only one. */
export const IS_DESIGN_MOCK = IS_MOCK || DESIGN_USE_MOCK;
