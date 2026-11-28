# Agent guidance — StockFlow Storefront

## Project scope

This repository is the StockFlowCommerce storefront. Every route is customer-facing Mode B storefront for modules 12–18:

- Module 12: Product Design, preflight, snapshot confirmation.
- Module 13: Catalog, PLP, PDP, variants, availability.
- Module 14: Cart and checkout.
- Module 15: Payment methods and manual bank transfer flow.
- Module 16: Sales chat.
- Module 17: Customer order tracking and amendments.
- Module 18: Customer profile, addresses, saved payment metadata, consent.

There is no back-office/admin surface in this project. Do not import Mode A density, admin sidebar, or data-table-first patterns.

## Next.js rules

- Use the App Router conventions.
- Keep `page.tsx` files thin and composition-focused.
- Prefer Server Components by default.
- Use Client Components only for local interactivity, form state, browser APIs, and query hooks.
- Keep route groups and layouts explicit.
- Use `next/image` for product imagery when image behavior matters.

## Storefront design rules

- Follow `src/_design/FRONTEND-AI-RULES.md` and `.claude/rules/mode-b-storefront.md`.
- Use Ink + Blue tokens: `bg-bg-base`, `bg-bg-surface`, `bg-bg-subtle`, `bg-bg-muted`, `border-border-default`, `text-ink-primary`, `text-ink-secondary`, `text-accent`.
- Use shadcn/Radix primitives for buttons, forms, dialogs, sheets, popovers, commands, radios, selects, checkboxes, switches, and tabs.
- Compose ecommerce UI from `components/storefront/*` before adding new components.
- Do not hardcode hex colors or raw px values in app/component/feature code.

## Architecture rules

- Feature business logic belongs in `src/features/*`.
- Shared presentational components belong in `src/components/shared/*`.
- Storefront-specific UI belongs in `src/components/storefront/*`.
- No component outside the mock adapter may import `src/lib/mock-data.ts`.
- API response parsing happens at the API boundary with zod.
- Server data belongs in TanStack Query; form state belongs in react-hook-form; URL state belongs in nuqs; global UI state belongs in zustand.

## Available local commands

- `/validate` — run and report project verification.
- `/fix-lint` — fix lint/typecheck issues without broad refactor.
- `/design-check` — read-only design-system audit.
- `/module` — productionize a storefront module with the project playbook.

## Available agents

- `architecture-reviewer` — read-only architecture review for feature boundaries, data layer, zod, state, and tests.
- `design-reviewer` — read-only UI/design-system review for tokens, storefront density, shadcn usage, responsive behavior, and accessibility.

## Available skills

- `status-badge` — use when wiring lifecycle/status UI.
- `zod-br-schema` — use when writing zod schemas or lifecycle transition tables from docs.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
