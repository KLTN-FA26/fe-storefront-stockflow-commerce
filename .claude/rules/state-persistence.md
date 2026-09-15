---
description: State boundaries — URL via nuqs, React Query, zustand, local UI state
globs:
  - "src/hooks/**"
  - "src/lib/store/**"
  - "src/app/**"
  - "src/features/**/components/**"
---

# State boundaries

Source: `src/_design/PRODUCTION-FRONTEND-RULES.md` §5.

## Boundary table

| State | Tool | Examples |
| --- | --- | --- |
| Server state | TanStack Query | products, cart, checkout quote, design detail, orders |
| Filter/search/sort/page/tab | URL via `nuqs` | catalog facets, order list filters, chat queue tab |
| Global UI state | zustand | theme, cart drawer, locale, customer session UI |
| Local UI state | `useState` | popover open, selected local tab, expanded card |
| Form state | react-hook-form | address form, checkout step form, design metadata form |

## URL state

Use URL state when another user or browser tab should see the same view after opening the link:

- search query.
- category/facet filters.
- sort.
- pagination.
- selected list tab.

Changing filters/search should reset page to 1.

## Local storage / persisted UI

Persist only personal UI preferences, not shareable data:

- visible columns if a table exists.
- density preference.
- collapsed optional panels.
- recently used non-sensitive UI settings.

Do not put server data or shareable filters in localStorage.

## React Query

- All server/cache state belongs in React Query.
- Use feature query-key factories.
- Mutations must invalidate related queries deliberately.
- Do not duplicate server state into zustand.

## zustand

Use zustand for global UI preferences and lightweight session UI state only. Do not use it as a replacement for React Query or forms.

## Forms

Use react-hook-form + zod for production forms. Keep validation rules in zod schemas, not scattered JSX checks.

## Bans

- Filter/search/sort only in `useState` for production lists.
- Server data in localStorage.
- Rewriting ad-hoc localStorage effects when a project hook/store already exists.
