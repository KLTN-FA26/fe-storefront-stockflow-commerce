---
description: Storefront feature folder structure, import boundaries, and file-size limits
globs: ["src/features/**", "src/app/**/page.tsx", "src/components/shared/**", "src/components/storefront/**"]
---

# Feature architecture

Source: `src/_design/PRODUCTION-FRONTEND-RULES.md` §1.

Business logic belongs in `features/`. `app/**/page.tsx` should compose UI and data hooks instead of owning business rules.

## Storefront module mapping

- Module 12 Product Design: `src/features/product-design` is the primary full feature folder.
- Modules 13–18 currently may have storefront pages/components before full feature extraction.
- New production work for catalog, cart, checkout, payment, chat, order, or customer account should move business logic toward `features/<module>` without forcing unrelated refactors.

## Target feature shape

```txt
features/<module>/
├── api.ts
├── schemas.ts
├── types.ts
├── queries.ts
├── mutations.ts
├── lifecycle.ts
├── selectors.ts
├── components/
└── index.ts
```

Use only the pieces required by the feature's maturity. For UI-only mock pages, avoid pretending the full production data layer exists.

## File-size guidance

- Feature file: about 200 lines max.
- Component: about 150 lines max.
- `page.tsx`: about 60 lines when a route has mature feature components.

If a file exceeds these, split by real responsibilities. Do not split purely to satisfy a number.

## Import boundaries

- `features/A` should not import `features/B`; share through `lib/domain`, `lib/format`, or props.
- `components/shared` must not import `features/*` or `lib/api/*`.
- `components/storefront` may know storefront UX patterns but should avoid hidden data fetching.
- `app/**/page.tsx` composes `features/*`, `components/storefront/*`, and `components/shared/*`.
- Only `src/lib/api/mock-adapter.ts` may import `src/lib/mock-data.ts`.

## Action gating

For lifecycle-heavy modules, centralize allowed actions:

- `lifecycle.ts` owns transition tables and terminal states.
- `allowedActions(status, role)` or equivalent returns action descriptors.
- JSX renders action descriptors instead of scattering lifecycle `if/else` blocks.
- Client-side permission checks are UI-only; backend must re-check.

## State boundaries

| State | Tool |
| --- | --- |
| Server data | TanStack Query |
| Filter/search/sort/page/tab | URL state via `nuqs` |
| Global UI preference | zustand persist |
| Local UI open/closed state | `useState` |
| Forms | react-hook-form + zod |

## Route states

Production routes need `loading.tsx`, `error.tsx`, and distinct empty states for:

- no data exists yet.
- filters/search produce no results.

## Formatting and lookup

- Money/date/number formatting belongs in `src/lib/format/*`.
- Do not scatter `.toLocaleString()` and `.find()` lookups through JSX.
- Product and order numbers should use tabular/mono presentation where appropriate.
