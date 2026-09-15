---
description: Mode B storefront modules 12-18 — Ink + Blue, ecommerce, airy, mobile-first
globs:
  - "src/app/(storefront)/**"
  - "src/components/storefront/**"
  - "src/features/{product-design,design,catalog,cart,checkout,payment,chat,order,customer}/**"
---

# Mode B — Storefront

Source: `src/_design/FRONTEND-AI-RULES.md` §2 and §5.

All routes in this repository are customer-facing storefront. The design language is Ink + Blue, ecommerce-first, mobile-first, spacious, and conversion-oriented.

## Theme

Use current storefront tokens:

| Role | Token classes |
| --- | --- |
| page background | `bg-bg-base` |
| card/panel | `bg-bg-surface` |
| subtle section | `bg-bg-subtle` |
| hover/selected | `bg-bg-muted` |
| border | `border-border-default`, `border-border-strong` |
| primary text | `text-ink-primary` |
| secondary text | `text-ink-secondary` |
| tertiary text | `text-ink-tertiary` |
| primary action | `bg-accent`, `text-accent` |
| inverse text | `text-ink-inverse` |

Do not introduce back-office/admin styling, caramel legacy theme, or one-off hex colors.

## Density and shape

- Mobile-first from 320px upward.
- Card/panel padding: usually `p-[var(--card-pad)]`.
- Section gaps: roomy (`space-y-6`, `space-y-8`, `gap-6`, `gap-8`).
- Card radius: `rounded-[var(--r-lg)]` or `rounded-[var(--r-xl)]`.
- Product/checkout cards may use light `shadow-md`/`shadow-lg`.
- Touch targets must be at least 44px.

## Style

- Marketing-focused and easy to scan.
- Prioritize product imagery, price clarity, availability, and CTA hierarchy.
- Use shadcn/Radix primitives for interactive controls.
- Use mobile drawers/sheets for filters and navigation.
- Hover motion should be subtle and useful, not decorative.

## Module 12 — Product Design

- Desktop layout: large viewer/canvas with side tools or report panel.
- Mobile layout: stacked sections; tool panels may become sheet/tabs.
- Preflight result must be visible.
- `Fail` blocks confirm.
- `Warning` requires customer risk confirmation before production.
- Add to cart is enabled only when Design status is `Confirmed`.
- Variant changes must trigger a recheck warning because print area can change.
- 2D/3D preview must disclose that real print color can differ.

## Module 13 — Catalog

- PLP uses product grid, filter sidebar on desktop, filter drawer on mobile, and sort control.
- PDP prioritizes gallery, price, variants, availability, quantity, delivery promise, and CTA.
- Product variants update price and availability.
- Out-of-stock variant should be disabled or clearly marked.
- Customizable products branch to design flow instead of direct add-to-cart.
- Empty search/filter state should suggest clearing filters or viewing popular products.

## Module 14 — Cart & Checkout

- Cart lines show image, variant, price, quantity stepper, stock state, and remove action.
- Block checkout when any line is unavailable or quantity exceeds allowed stock.
- Totals must be transparent: subtotal + shipping + tax − discount = total.
- Checkout uses stepper/wizard structure: cart, address, shipping, payment, review.
- Address input uses Vietnam cascading searchable comboboxes.

## Module 15 — Payment

- Payment methods render as radio-card options.
- Bank transfer shows bank name, account holder, transfer content, and copy affordance.
- Do not collect or store full card data; only brand and last4 may be displayed.

## Module 16 — Sales Chat

- Customer-facing chat must never render internal sale notes.
- SLA/response-time expectations should be visible when relevant.
- Offline state should set a clear expectation and capture contact information.

## Module 17/18 — Order & Customer

- Order timeline shows fulfillment progress and tracking state.
- Amend/cancel actions are gated by order status.
- Address book uses Vietnam cascading address fields.
- Saved payment methods show metadata only.
- Privacy and marketing consent actions need explicit states.

## Common rules

- Lifecycle/status presentation goes through `<StatusBadge domain status>` when available.
- Money formatting goes through `src/lib/format/money.ts` or existing project formatter.
- Heavy 3D/canvas libraries must be lazy-loaded and provide a fallback.
- All interactive UI needs visible focus state and keyboard support.
