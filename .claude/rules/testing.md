---
description: Vitest, RTL, MSW expectations for storefront modules
globs:
  - "src/**/__tests__/**"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "src/test/**"
  - "vitest.config.mts"
---

# Testing

Source: `src/_design/PRODUCTION-FRONTEND-RULES.md` §11.

Run:

```bash
pnpm run test
```

Watch:

```bash
pnpm run test:watch
```

Coverage:

```bash
pnpm run coverage
```

## Layers

| Type      | Scope                                        | Tool                        |
| --------- | -------------------------------------------- | --------------------------- |
| Unit      | selectors, lifecycle, format, zod schemas    | Vitest                      |
| Component | storefront cards/forms/selectors             | RTL + jsdom                 |
| Feature   | list filters, action gating, wizard behavior | RTL + MSW                   |
| Contract  | fixture JSON parsing with zod                | Vitest                      |
| E2E later | catalog → design/cart → checkout → order     | Playwright or chosen runner |

## Required tests for production features

- Lifecycle transition table, including terminal states.
- Action gating for important roles/states.
- Zod schemas for form payload and response parsing.
- Selectors and derived totals.
- Checkout/cart edge cases: blocked line, changed price, unavailable voucher, pending mutation.

## Coverage targets

- `src/lib/domain/*` and `features/*/{selectors,schemas,lifecycle}.ts`: target 90% when those modules exist.
- Components: target 70% for reusable components.
- Do not require coverage on `app/**/page.tsx`.

## MSW and test rendering

- Use MSW for API-level behavior rather than mocking hooks.
- Use a shared test render helper when providers are required.
- Query by role/label/text visible to the user.
- Prefer `userEvent` over `fireEvent`.

## Rules

- Test behavior, not implementation details.
- No `any`, `@ts-ignore`, or `eslint-disable` to force tests through.
- Each important business rule should have a failing test if removed.
