---
description: Storefront shared component map and reuse rules
globs:
  - "src/components/**"
  - "src/features/**/components/**"
---

# Shared components

Source: `src/_design/FRONTEND-AI-RULES.md` §6.

Before writing a new component, check whether `components/ui`, `components/shared`, or `components/storefront` already has the primitive/composition you need.

## Layers

| Directory | Purpose | Rule |
| --- | --- | --- |
| `components/ui/` | shadcn/Radix primitives | primitive-level only; add missing primitive when needed |
| `components/shared/` | reusable cross-storefront building blocks | no business/API imports |
| `components/storefront/` | ecommerce/customer-facing compositions | can know storefront UX patterns |
| `features/*/components/` | module-specific UI | can know feature business rules |

## Storefront components to reuse

### Catalog and PDP

- `<ProductCard>`
- `<ProductGrid>`
- `<ImageGallery>`
- `<PriceDisplay>`
- `<AvailabilityBadge>`
- `<VariantSelector>`
- `<RatingStars>`
- `<WishlistButton>`
- `<QuantityStepper>`

### Cart and checkout

- `<CartLineItem>`
- `<VoucherInput>`
- `<OrderTotals>`
- `<CheckoutStepper>`
- `<AddressForm>`
- `<ShippingMethodSelector>`
- `<PaymentMethodSelector>`

### Order and customer

- `<OrderTimeline>`
- `<TrackingProgress>`
- `<OrderCard>`
- `<ReturnRequestForm>`
- `<CustomerProfileCard>`
- `<AddressBook>`
- `<SavedPaymentMethod>`
- `<SegmentBadge>`
- `<LoyaltyTierBadge>`

### Chat

- `<ChatBubble>`
- `<ChatComposer>`
- `<RichLinkCard>`
- `<InternalNote>` for sale/admin-only contexts only; do not render to customers.
- `<SLABadge>`
- `<CSATSurvey>`

### Design

- `<DesignCanvas>`
- `<CanvasToolbar>`
- `<LivePreview3D>` with fallback
- `<PreflightReport>`
- `<DesignVersionList>`

## Shared rules

- Shared components receive data through props.
- Shared components do not fetch data.
- Shared components do not import feature modules.
- Interactive components must have visible focus state and keyboard behavior.
- Dark mode must work through tokens.
- Use `StatusBadge` for lifecycle/status display when available.
- Use `EmptyState`, `Alert`, skeletons, and shadcn primitives before creating one-off UI.

## Mock data

- Mock data should cover enough status values to demo badges and action gating.
- Keep mock data static and colocated with the adapter/data layer.
- Do not import `src/lib/mock-data.ts` from page/component/feature UI code.
