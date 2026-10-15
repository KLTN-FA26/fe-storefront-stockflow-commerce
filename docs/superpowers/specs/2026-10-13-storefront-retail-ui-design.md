# Storefront retail UI refresh — design

- Date: 2026-10-13
- Branch: `fix/UI`
- Status: approved in brainstorming, pending spec review

## 1. Intent

### What the user said

- The current storefront does not read as a professional ecommerce site: it looks fragmented, generic and too basic.
- Padding is too large; the layout looks like a temporary scaffold and is boring.
- Hard constraint: change UI only. Logic shipped in previous PRs (customer profile, address book, orders, security, product design) must stay 100% unchanged.

### Decisions taken during brainstorming

| Topic | Decision |
| --- | --- |
| Visual direction | Compact professional retail (Uniqlo / Decathlon / Tiki brand-store feel) |
| Scope | Foundation + every storefront route in one spec; plan split by page group |
| Feature component boundary | Markup and `className` may change; hooks, handlers, state, conditions, business copy, `role`/`aria-*`/`id` may not |
| Approach | A — density tokens + retail shell + shared layout kit, then restyle each page group |
| `FRONTEND-AI-RULES.md` §3.2 | User explicitly approved updating it to the new density (option 1) |

### Assumptions

- Ink + Blue palette, fonts (Inter / Inter Tight / JetBrains Mono) and dark mode stay as they are.
- Demo data pages (home, catalog, PDP, cart, checkout, chat, payment) keep their current demo data and local state.
- Category links in the new header point to `/catalog` until category routes exist.

### Success criteria

1. Every route uses the same page frame (breadcrumb + title on page background), the same card style and the same section rhythm.
2. Card padding is 16px on mobile / 20px from `sm`; page vertical padding and section gaps are visibly tighter than today.
3. Header has search, category navigation and account/cart entry points; footer has trust bar, link columns and payment chips.
4. `git diff main` shows no change in the protected paths listed in §6, and all existing tests pass without editing any test.
5. Each page group is checked in the browser at desktop, 375px mobile and dark mode with no horizontal page scroll.

## 2. Root causes in the current UI

- `--card-pad: 24px`, page `py-8`/`lg:py-12`, section `gap-14`: everything is spaced like a landing page.
- Each page opens with a large "hero card" (white, `p-[var(--card-pad)]`, `shadow-md`) holding only the title, followed by more floating cards. Repeated heavy shadows separate every block from its neighbours.
- No shared page frame: every page writes its own `mx-auto max-w-* px-* py-*` and its own card class string.
- Header is a single thin row with no search field and no category navigation; footer is minimal.
- Primary CTAs are all `rounded-full`, which reads as a prototype rather than a retail store.

## 3. Foundation

### 3.1 Tokens (`src/app/globals.css`)

| Token / rule | Before | After |
| --- | --- | --- |
| `--card-pad` | `24px` | `16px`; `20px` from 640px via media query |
| `--card-shadow` | `var(--sh-md)` | `var(--sh-sm)` |
| `--card-border` | `none` | `1px solid var(--border-default)` |
| Card hover (product cards) | lift + `shadow-lg` | border to `border-strong` + `--sh-md`, no lift |
| Page vertical padding | `py-8` / `lg:py-12` | `py-5` / `lg:py-6` (owned by `PageShell`) |
| Section gap | `gap-14` | `gap-8` / `lg:gap-10` (owned by `PageShell` / `Section`) |

Unchanged: `max-w-7xl`, `px-4 sm:px-6 lg:px-8`, radius scale, color tokens, fonts, dark mode values.

### 3.2 Buttons

- Primary and secondary CTAs use `rounded-[var(--r-md)]` at the composition site.
- `rounded-full` is kept for chips, filters, badges, icon buttons and count bubbles.
- `components/ui/button.tsx` is not edited.

### 3.3 Rules document

Update `src/_design/FRONTEND-AI-RULES.md` (user-approved):

- §3.2 and the Mode B density row: replace "Airy / `--card-pad: 24px`" with "Compact retail: `--card-pad` 16px mobile / 20px ≥ sm".
- Shadow paragraph: cards use border + `--sh-sm`; product card hover raises to `--sh-md` without translate.

Mirror the same values in `.claude/rules/design-tokens.md` and `.claude/rules/mode-b-storefront.md` where they mention density.

## 4. Shell

Split `src/components/storefront/storefront-shell.tsx` into focused files (each about 150 lines max) under `src/components/storefront/shell/`:

| File | Responsibility |
| --- | --- |
| `announcement-bar.tsx` | Static strip, `bg-brand text-ink-inverse`, 36px, scrolls away |
| `site-header.tsx` | Sticky header tier 1 + tier 2 |
| `header-search.tsx` | `<form method="get" action="/catalog">` with `name="q"` |
| `mobile-nav.tsx` | Sheet menu: categories, account, orders, support; rows ≥ 44px |
| `site-footer.tsx` | Trust bar, link columns, bottom bar |
| `nav-config.ts` | Category links, footer columns, account links (plain module) |

Header tier 1 (64px, sticky): mobile menu button, logo, search (inline on `md+`, full-width second row on mobile), Tư vấn, Tài khoản, Giỏ hàng with count. Icon + label from `lg`.

Header tier 2 (44px, `md+` only): Tất cả sản phẩm · Áo & hoodie · Quà tặng in ấn · Ấn phẩm doanh nghiệp · Thiết kế riêng (accent). Right side: Theo dõi đơn hàng, Hỗ trợ.

Footer: `TrustBar` (giao hàng, đổi trả, thanh toán an toàn, hỗ trợ) → four link columns → bottom bar with copyright and text payment chips (VietQR, Visa, Mastercard, COD).

Floating actions: remove the floating cart button (the header has the cart); keep the chat button.

The header search is the only new behaviour in this spec. It submits a GET to `/catalog`; the catalog page does not have to read `q` yet.

## 5. Layout kit (`src/components/storefront/`)

All components receive data through props, do no fetching and import no feature modules.

| Component | Purpose |
| --- | --- |
| `PageShell` | `max-w-7xl` frame with standard padding; props `breadcrumbs`, `title`, `subtitle`, `actions`, `children`, optional `width` (`default`, `narrow`) |
| `Breadcrumbs` | `nav[aria-label="Breadcrumb"]`, `text-xs`, last item `aria-current="page"` |
| `Section` + `SectionHeader` | Section spacing; title `text-xl sm:text-2xl`, optional eyebrow, optional "Xem tất cả →" link |
| `TrustBar` | Icon + two-line USP items; used in footer, PDP and cart |
| `SurfaceCard` | The single card style: `bg-bg-surface border rounded-[var(--r-lg)] p-[var(--card-pad)] shadow-[var(--sh-sm)]`; `as` prop for `section`/`article`/`div` |

`components/shared/PageContainer`, `PageHeader` and `Card` stay exported for compatibility; their padding follows the new tokens. Storefront pages move to `PageShell` / `SurfaceCard`.

## 6. Page groups

### 6.1 Shopping

- **Home:** two-column hero (main banner block in `bg-brand` with CTA; two stacked secondary banners: Thiết kế riêng, Quà doanh nghiệp) → `TrustBar` → category row (horizontal scroll on mobile) → "Sản phẩm nổi bật" grid with `SectionHeader` → compact 3-step design strip.
- **Catalog:** no hero card; breadcrumb + title + product count. Flat 260px filter sidebar split by dividers. Toolbar with active chips and sort select, sticky on mobile. Grid 2 / 3 (`lg`) / 4 (`xl`) columns. Mobile filter stays a Sheet.
- **ProductCard:** border instead of shadow, tighter body, badge top-left of the image, bold price with optional compare-at price, hover changes border and slightly zooms the image.
- **PDP:** breadcrumb; sticky gallery on the left; buy column on the right without a card wrapper (name, rating, price, variants, quantity, CTA, delivery promise); then `TrustBar`; then related products.
- **Cart:** no hero card; `1fr_360px`; all lines in one `SurfaceCard` separated by dividers; sticky summary on the right. `useState`, totals and `canCheckout` unchanged.
- **Checkout:** same frame as cart; compact `CheckoutStepper` at the top. Local state and derived values unchanged.
- **Payment result:** centred `SurfaceCard` with status icon.

### 6.2 Account, order, address

- **Account layout/sidebar:** tighter sidebar using the new tokens; drop the per-item description line; breadcrumb at the top of the content column.
- **Profile / security:** form inside `SurfaceCard`; `text-xl` heading; label/field two-column grid on `lg`.
- **Orders list:** existing status tabs/filters keep their nuqs logic and are restyled as an underline tab bar. `OrderCard` becomes compact: header row (order number, date, badge), line row with small thumbnails, footer row (total, CTA); cards separated by borders with tight gaps.
- **Order detail:** two columns on `lg` — left: status hero, stepper, items; right (sticky): payment summary, shipping address, `OrderHelpCard`. Mobile stays stacked.
- **Address book:** two-column card grid from `md`; default address gets an accent border; edit/delete actions grouped in the card footer.
- **Loading skeletons** (`loading.tsx`, `order-states.tsx`, `address-book-states.tsx`) follow the new layouts.

### 6.3 Design and chat

- **Design list:** `PageShell` + grid of design cards (thumbnail, name, `StatusBadge`).
- **Design editor:** density only; viewer/panel layout and preflight / Confirmed rules unchanged.
- **Chat list:** inbox style — one `SurfaceCard`, rows with letter avatar, last message, unread count, dividers; static SLA note "Phản hồi trong ~15 phút giờ hành chính".
- **Chat detail:** density only.

## 7. Logic-preservation guardrails

### 7.1 Protected paths — must have zero diff against `main`

```txt
src/features/**/*.ts            (api, schemas, queries, mutations, lifecycle, selectors, errors, types, index)
src/lib/**
src/hooks/**
src/**/*.test.ts
src/**/*.test.tsx
src/**/__tests__/**
```

`src/constants/**` may change only to add navigation labels/links; existing values stay unchanged.

Check command, run at the end of every page group:

```bash
git diff --stat --diff-filter=MDR main -- "src/features/**/*.ts" "src/lib" "src/hooks" "src/**/*.test.ts" "src/**/*.test.tsx" "src/**/__tests__"
```

Expected output: empty. `--diff-filter=MDR` lets new test files (layout kit, shell, characterization tests) be added while every existing protected file stays byte-identical.

### 7.2 Feature `.tsx` files

Allowed: JSX structure, wrapper elements, `className`, visual order of already-rendered elements.

Not allowed: hooks and their arguments, handlers, state, conditions/branches, props passed to logic components, business copy, `role`, `aria-*`, `id`, `name`, `htmlFor`, `data-*` used by tests or forms.

After each page group, the `architecture-reviewer` agent reads the diff and reports any non-UI line.

### 7.3 Verification per page group

1. `pnpm run validate` passes (typecheck, lint, tests, build); the test count stays at 194 or higher and no test file changes.
2. Browser preview on the dev server: desktop, 375px mobile, dark mode; no horizontal page scroll; touch targets ≥ 44px; visible focus rings.
3. One commit per page group.

## 8. Delivery order

1. Tokens + rules documents + shell.
2. Layout kit (`PageShell`, `Breadcrumbs`, `Section`, `SectionHeader`, `TrustBar`, `SurfaceCard`) with component tests.
3. Shopping pages (home, catalog, ProductCard, PDP, cart, checkout, payment).
4. Account, order, address.
5. Design, chat.

## 9. Out of scope

- New data, API endpoints or mock-adapter routes.
- Making the catalog actually filter by `q` or by category.
- Real category routes, mega menu, newsletter signup, wishlist behaviour.
- Changes to `components/ui/*` primitives.
- Palette, font or dark-mode color changes.
