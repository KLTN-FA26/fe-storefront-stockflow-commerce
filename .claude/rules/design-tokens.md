---
description: Storefront token table and styling restrictions
globs: ["src/**/*.tsx", "src/**/*.css", "src/lib/tokens.ts"]
---

# Design tokens

Source: `src/_design/FRONTEND-AI-RULES.md` §3.

Tokens are defined once in `globals.css` and Tailwind utilities are generated from them. Do not define one-off colors in component code.

## Hard bans

- No gradients in product UI unless the design rules explicitly allow it.
- No raw hex colors in `src/app`, `src/components`, or `src/features`.
- No pink/magenta/fuchsia styling.
- No `!important`.
- No arbitrary z-index values outside the project scale.
- No Mode A/back-office density or admin-only theme in storefront routes.

## Storefront palette: Ink + Blue

Use these tokens/classes in storefront UI:

| Role | Class examples |
| --- | --- |
| page background | `bg-bg-base` |
| card/panel | `bg-bg-surface` |
| subtle area | `bg-bg-subtle` |
| hover/selected/disabled | `bg-bg-muted` |
| default border | `border-border-default` |
| strong border/focus | `border-border-strong` |
| primary text | `text-ink-primary` |
| secondary text | `text-ink-secondary` |
| tertiary/meta text | `text-ink-tertiary` |
| text on accent | `text-ink-inverse` |
| primary action/link | `text-accent`, `bg-accent` |

## Semantic tokens

Semantic status tokens are shared across storefront modules:

| Token | Meaning |
| --- | --- |
| `positive` | success, completed, in stock |
| `info` | informational, in progress |
| `warning` | needs attention, pending, low stock |
| `danger` | error, cancelled, failed, out of stock |
| `neutral` | draft or neutral state |
| `muted` | closed, inactive, archived |
| `special` | production, refund, exceptional business state |

Priority when a status seems to fit multiple tones:

```txt
special > danger > positive > warning > info > muted > neutral
```

Render lifecycle/status text through `<StatusBadge domain status>` when available. Do not hand-paint status badges with `bg-green-*`, `text-red-*`, etc.

## Spacing and radius

- Use the project spacing scale and density variables.
- Storefront card/panel padding should usually use `p-[var(--card-pad)]`.
- Storefront cards use `rounded-[var(--r-lg)]` or `rounded-[var(--r-xl)]`.
- Touch targets must be at least 44px.

## Typography

- Headings use the project display font utilities.
- Money, quantities, totals, ratings, and IDs should use `tabular-nums`.
- Product/SKU/order identifiers should use mono where alignment matters.
- Avoid all-caps labels unless it is a real eyebrow/overline.
- Keep body copy readable, ideally under 75 characters per line.

## Dark mode

- Use CSS variables and token utilities.
- Do not hardcode light-theme colors into JSX.
- Interactive controls need visible `focus-visible` rings in both light and dark mode.

## shadcn customization

`components/ui/*` should stay primitive-level. Put product-specific styling in `components/storefront/*`, `components/shared/*`, or `className` at composition sites.
