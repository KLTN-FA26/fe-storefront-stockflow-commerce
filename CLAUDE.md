# StockFlow Storefront — Claude Code instructions

This project is the customer-facing StockFlowCommerce storefront for modules 12–18. Treat every route in this repository as Mode B storefront: ecommerce UX, mobile-first, Ink + Blue token theme, large product imagery, rounded cards, light shadows, and touch targets of at least 44px.

## Stack

- Next.js App Router with TypeScript strict mode.
- Tailwind CSS v4 token system.
- shadcn/ui and Radix primitives for interactive controls.
- TanStack Query for server state.
- axios for API calls.
- zod + react-hook-form for forms and API boundaries.
- zustand for global UI state.
- nuqs for URL filters/search/sort/page.
- Vitest, RTL, MSW for tests.

## Rules to read before changing code

- `src/_design/FRONTEND-AI-RULES.md` — design system, theme, shadcn-first rules.
- `src/_design/PRODUCTION-FRONTEND-RULES.md` — production architecture and data rules.
- `.claude/rules/design-tokens.md` — token quick reference.
- `.claude/rules/mode-b-storefront.md` — storefront UX rules.
- `.claude/rules/feature-architecture.md` — feature and import boundaries.
- `.claude/rules/api-conventions.md` — data layer, zod, React Query.
- `.claude/rules/shared-components.md` — reusable component map.
- `.claude/rules/state-persistence.md` — URL/local/global state boundaries.
- `.claude/rules/testing.md` — test expectations.

## Non-negotiable rules

- Use `pnpm` only. Do not use `npm`, `yarn`, or `bun`.
- Do not read, copy, or edit `.env` or `.env.*`. Edit `.env.example` for documentation only.
- Do not import `src/lib/mock-data.ts` outside `src/lib/api/mock-adapter.ts`.
- Do not hardcode hex colors or raw px values in `src/app`, `src/components`, or `src/features`.
- Do not modify `src/_design/*RULES.md` unless the user explicitly asks.
- Do not edit `components/ui/*` for product-specific styling. Add a shadcn primitive only when the project is missing that primitive; put custom composition in `components/shared/*` or `components/storefront/*`.
- Keep storefront customer-facing. Do not introduce `/admin/*`, back-office density, data-table-first layouts, or Mode A rules.

## Implementation guidance

- Prefer Server Components. Add `"use client"` only where interaction, state, or browser APIs require it.
- Pages should compose feature/storefront components and stay thin.
- Server data belongs in React Query hooks, not component-local fetch logic.
- Filter, search, sort, pagination, and tabs belong in URL state via `nuqs`.
- Form state belongs in react-hook-form with zod input schemas.
- Shared components must not import business features or API code.
- Storefront UI should reuse `components/storefront/*`, `components/shared/*`, and shadcn primitives before adding new components.

## Verification

Before reporting implementation work as done, run the relevant checks:

```bash
pnpm run typecheck
```

```bash
pnpm run lint
```

```bash
pnpm run test
```

```bash
pnpm run build
```

Or run the aggregate check:

```bash
pnpm run validate
```

For visible UI changes, verify in the browser preview when available and report any blocker explicitly.
