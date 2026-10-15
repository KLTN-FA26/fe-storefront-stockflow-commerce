# Storefront Retail UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the storefront into a compact, consistent retail UI (density tokens, two-tier header, shared layout kit, restyled pages) without changing any existing logic.

**Architecture:** Retune density tokens in `globals.css`, split the shell into focused files under `components/storefront/shell/`, add a props-only layout kit under `components/storefront/layout/`, then restyle page groups one commit at a time. Feature `.tsx` files change only in JSX structure and `className`; protected logic paths keep a zero diff.

**Tech Stack:** Next.js App Router, TypeScript strict, Tailwind CSS v4 tokens, shadcn/Radix, lucide-react, Vitest + RTL + userEvent.

**Spec:** `docs/superpowers/specs/2026-10-13-storefront-retail-ui-design.md`

## Global Constraints

- UI only. Protected-path check must print nothing before every commit:
  `git diff --stat --diff-filter=MDR main -- "src/features/**/*.ts" "src/lib" "src/hooks" "src/**/*.test.ts" "src/**/*.test.tsx" "src/**/__tests__"`
- Feature `.tsx`: may change JSX structure, wrappers, `className`, visual order. Must not change hooks/arguments, handlers, state, conditions, props passed to logic components, business copy, `role`, `aria-*`, `id`, `name`, `htmlFor`, `data-*`.
- Never run `prettier --write` / `eslint --fix` on a directory. Stage files by explicit path; lint-staged formats only staged files.
- `pnpm` only. No raw hex or raw px in `src/app`, `src/components`, `src/features`; px values live in `globals.css` tokens.
- Do not edit `components/ui/*`. Do not import `src/lib/mock-data.ts`.
- `--card-pad`: `16px`, `20px` from 640px. `--card-shadow: var(--sh-sm)`. Card border `1px solid var(--border-default)`.
- Page padding `py-5 lg:py-6`; section gap `gap-8 lg:gap-10`; container `max-w-7xl px-4 sm:px-6 lg:px-8`.
- CTAs `rounded-[var(--r-md)]`; `rounded-full` only for chips, filters, badges, icon buttons, count bubbles.
- Touch targets ≥ 44px (`min-h-11` / `size-11`); visible `focus-visible` ring on every interactive element.
- Copy is Vietnamese; reuse existing strings verbatim where they already exist.
- Dev server: the user runs one on `http://localhost:3000`; attach with preview `storefront-existing`, do not start a second one.
- Commit messages: conventional commits (commitlint), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Sticky header overlapping sticky sidebars/summaries (header grows to two tiers) — sticky elements must sit below it at every breakpoint. Pinned by the `--sticky-top` token (Task 1) and the browser check in Tasks 5–8.
2. Horizontal page scroll at 320px from the new header (logo + icons + cart) and category rows — pinned by the 320px `scrollWidth` check in Task 3 and each page task.
3. Demo-page logic drifting during restyle (cart checkout gating, checkout totals) — pinned by characterization tests written before the restyle in Task 6.
4. Header search submitting somewhere unexpected or with a different field name — pinned by the header search test in Task 3.
5. Dark mode contrast on the new `bg-brand` announcement bar and hero banner (brand flips to near-white in dark) — pinned by the dark-mode browser check in Tasks 3 and 4.

---

### Task 1: Density tokens and rules documents

**Files:**

- Modify: `src/app/globals.css` (`:root` density block, lines ~34–40)
- Modify: `src/_design/FRONTEND-AI-RULES.md` (§2 density row ~line 78, §3.2 ~lines 132–137, shadow paragraph ~line 159)
- Modify: `.claude/rules/design-tokens.md`, `.claude/rules/mode-b-storefront.md` (density/shadow lines)
- Modify: `src/components/shared/PageContainer.tsx` (`py-8` → `py-5 lg:py-6`)

**Interfaces:**

- Produces CSS variables: `--card-pad` (16px; 20px at `min-width: 640px`), `--card-shadow: var(--sh-sm)`, `--card-border: 1px solid var(--border-default)`, `--header-h` (`116px` = 64px tier 1 + 52px mobile search row; `108px` = 64 + 44 from 768px), `--sticky-top: calc(var(--header-h) + 16px)`.

- [ ] **Step 1: Update `:root` in `globals.css`** with the values above; add `@media (min-width: 640px) { :root { --card-pad: 20px; } }` and `@media (min-width: 768px) { :root { --header-h: 108px; } }`. Change the comment "airy spacing" to "compact retail density".
- [ ] **Step 2: Update the rules documents.** FRONTEND-AI-RULES: density row → "Compact retail: `--card-pad` 16px mobile / 20px ≥ sm"; §3.2 heading "(compact retail)" with the same values; shadow paragraph → "cards: border + `--sh-sm`; product card hover raises to `--sh-md` without translate". Mirror in both `.claude/rules` files.
- [ ] **Step 3: Verify.** Run `pnpm run validate` → passes, 194 tests. Run the protected-path check → empty.
- [ ] **Step 4: Commit** `style(tokens): switch storefront to compact retail density` staging only the four files.

### Task 2: Layout kit

**Files:**

- Create: `src/components/storefront/layout/{page-shell,breadcrumbs,section,trust-bar,surface-card}.tsx`, `src/components/storefront/layout/trust-items.ts`, `src/components/storefront/layout/index.ts`
- Test: `src/components/storefront/layout/__tests__/layout-kit.test.tsx`

**Interfaces:**

- `type BreadcrumbItem = { label: string; href?: string }`
- `Breadcrumbs({ items }: { items: BreadcrumbItem[] })` — `nav[aria-label="Breadcrumb"]` > `ol`; items with `href` render `Link`; last item renders text with `aria-current="page"`; separators `aria-hidden`.
- `PageShell({ breadcrumbs?, title?, subtitle?, actions?, width?: "default" | "narrow", className?, children })` — `max-w-7xl` (narrow: `max-w-3xl`), `px-4 sm:px-6 lg:px-8 py-5 lg:py-6`, `space-y-8 lg:space-y-10`; title is `h1` `font-display text-2xl sm:text-3xl font-bold`.
- `SectionHeader({ title, eyebrow?, action?: { href: string; label: string }, as?: "h2" | "h3" })` — action link text `${label}` + `ArrowRight` icon, `min-h-11`.
- `Section({ title?, eyebrow?, action?, id?, className?, children })` — renders `SectionHeader` when `title` is set; `section` gets `aria-labelledby` pointing at the heading.
- `type TrustItem = { icon: LucideIcon; title: string; desc: string }`; `defaultTrustItems: TrustItem[]` in `trust-items.ts` (Giao hàng toàn quốc / Đổi trả 7 ngày / Thanh toán an toàn / Hỗ trợ thiết kế).
- `TrustBar({ items = defaultTrustItems, variant?: "plain" | "card" })` — grid 2 cols mobile, 4 cols `lg`.
- `SurfaceCard({ as?: "div" | "section" | "article" | "aside", padded = true, className?, children })` — `bg-bg-surface border border-border-default rounded-[var(--r-lg)] shadow-[var(--card-shadow)]`, `p-[var(--card-pad)]` when padded.

- [ ] **Step 1: Write failing tests** in `layout-kit.test.tsx`:
  - `Breadcrumbs` renders links for items with `href` and marks the last item `aria-current="page"`; `getByRole("navigation", { name: "Breadcrumb" })` exists.
  - `PageShell` renders `title` as the only `heading` level 1 and renders `breadcrumbs` when given.
  - `Section` with `title` + `action={{ href: "/catalog", label: "Xem tất cả" }}` renders `getByRole("region", { name: title })` and `getByRole("link", { name: /Xem tất cả/ })` with `href="/catalog"`.
  - `TrustBar` renders 4 default item titles.
  - `SurfaceCard as="article"` renders an `article` element; `padded={false}` omits the padding class.
- [ ] **Step 2: Run** `pnpm exec vitest run src/components/storefront/layout` → FAIL (modules missing).
- [ ] **Step 3: Implement** the files per the Interfaces block; `index.ts` re-exports all components and types.
- [ ] **Step 4: Run** the same command → PASS; then `pnpm run typecheck && pnpm run lint` → clean.
- [ ] **Step 5: Commit** `feat(storefront): add the retail layout kit`.

### Task 3: Shell — announcement bar, two-tier header, mobile nav, footer

**Files:**

- Create: `src/components/storefront/shell/{nav-config.ts,announcement-bar.tsx,header-search.tsx,site-header.tsx,mobile-nav.tsx,site-footer.tsx}`
- Modify: `src/components/storefront/storefront-shell.tsx` (becomes composition only: AnnouncementBar → SiteHeader → main → SiteFooter → chat FAB)
- Test: `src/components/storefront/shell/__tests__/shell.test.tsx`

**Interfaces:**

- Consumes: `TrustBar` (Task 2), `STORE_ROUTES`, `BRAND`.
- `nav-config.ts` exports `categoryLinks: { href: string; label: string; highlight?: boolean }[]` (Tất cả sản phẩm, Áo & hoodie, Quà tặng in ấn, Ấn phẩm doanh nghiệp → `STORE_ROUTES.catalog.list`; Thiết kế riêng → `STORE_ROUTES.design.list`, `highlight: true`), `utilityLinks` (Theo dõi đơn hàng → orders list, Hỗ trợ → chat list), `footerColumns` (existing three columns + "Về StockFlow"), `paymentMethods = ["VietQR", "Visa", "Mastercard", "COD"]`.
- `HeaderSearch({ className? })` — `form[role="search"][method="get"][action="/catalog"]`, `input[type="search"][name="q"]` with `aria-label="Tìm sản phẩm"`, submit button `aria-label="Tìm kiếm"`.
- `SiteHeader()` — whole header sticky `top-0 z-40`; tier 1 `h-16`; tier 2 `hidden md:flex h-11`; mobile search row `md:hidden`. Cart link shows the text "Giỏ hàng" (visually hidden below `sm`, so it stays the accessible name) and the existing count bubble `2`.
- `MobileNav()` — the existing Sheet trigger (`aria-label="Mở menu"`) with category, account and utility links, rows `min-h-11`.
- `SiteFooter()` — `TrustBar` → link columns → bottom bar (© year + payment chips).

- [ ] **Step 1: Write failing tests** in `shell.test.tsx`:
  - `HeaderSearch`: `getByRole("search")` has `action` ending `/catalog` and `method="get"`; `getByRole("searchbox", { name: "Tìm sản phẩm" })` has `name="q"`.
  - `SiteHeader`: renders a link per `categoryLinks` label; `getByRole("link", { name: /Giỏ hàng/ })` has `href="/cart"`.
  - `SiteFooter`: renders every `paymentMethods` label and the 4 trust titles.
  - `StorefrontShell`: `queryByLabelText("Mở giỏ hàng")` is null (floating cart removed); `getByLabelText("Mở tư vấn")` exists.
- [ ] **Step 2: Run** `pnpm exec vitest run src/components/storefront/shell` → FAIL.
- [ ] **Step 3: Implement** the shell files; `storefront-shell.tsx` keeps its export name `StorefrontShell` so `app/(storefront)/layout.tsx` is untouched.
- [ ] **Step 4: Run** tests → PASS; `pnpm run validate` → passes.
- [ ] **Step 5: Browser check** on `/` at desktop, 375px, 320px, dark: header tiers render; `document.documentElement.scrollWidth <= innerWidth` at 320px; announcement bar text readable in dark mode; Tab reaches search, categories, cart with visible focus.
- [ ] **Step 6: Protected-path check** → empty. **Commit** `feat(shell): retail two-tier header and full footer`.

### Task 4: ProductCard and home page

**Files:**

- Modify: `src/components/storefront/product-card.tsx`, `src/components/storefront/product-grid.tsx`, `src/app/(storefront)/page.tsx`
- Create (if `page.tsx` would exceed ~120 lines): `src/components/storefront/home/{home-hero,category-row,design-steps}.tsx`

**Interfaces:**

- Consumes: `PageShell`, `Section`, `TrustBar`, `SurfaceCard` (Task 2).
- `ProductCard` props unchanged. `ProductGrid` props unchanged; grid becomes `grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4` (accept an optional `columns?: 3 | 4` default 4 for related-products rows).

- [ ] **Step 1: Restyle `ProductCard`**: border card (`border-border-default`, `rounded-[var(--r-lg)]`, `--sh-sm`), hover `border-border-strong` + `shadow-[var(--sh-md)]`, no translate; image `aspect-square` flush to the top; body `p-3 space-y-1.5`; badge top-left of image; `AvailabilityBadge` moves under the name.
- [ ] **Step 2: Rebuild home** per spec §6.1: hero (main `bg-brand text-ink-inverse` banner + two stacked secondary banners) → `TrustBar` → category row (`overflow-x-auto` on mobile, grid on `lg`) → `Section title="Sản phẩm nổi bật" action={{ href: catalog, label: "Xem tất cả" }}` with `ProductGrid` → compact 3-step strip in one `SurfaceCard`. Keep existing data arrays and copy.
- [ ] **Step 3: Verify**: `pnpm run validate` passes; browser check `/` desktop, 375px, 320px, dark (hero contrast); protected-path check empty.
- [ ] **Step 4: Commit** `style(home): retail home layout and compact product card`.

### Task 5: Catalog and PDP

**Files:**

- Modify: `src/app/(storefront)/catalog/page.tsx`, `src/app/(storefront)/catalog/[slug]/page.tsx`
- Create (only if a page exceeds ~120 lines): `src/components/storefront/catalog/filter-panel.tsx`

**Interfaces:**

- Consumes: `PageShell`, `Breadcrumbs` items, `TrustBar`, `Section`, `ProductGrid` (Tasks 2, 4).

- [ ] **Step 1: Catalog** per spec §6.1: `PageShell breadcrumbs=[Trang chủ, Sản phẩm] title="Sản phẩm in ấn và quà tặng tùy biến"`; layout `lg:grid-cols-[16rem_minmax(0,1fr)]`; flat filter aside (no card, `divide-y`), `lg:sticky lg:top-[var(--sticky-top)]`; toolbar row with product count, chips, existing `Select` (trigger `min-h-11 rounded-[var(--r-md)]`), toolbar `sticky top-[var(--header-h)] z-30 bg-bg-base` below `lg`, static from `lg`; mobile filter Sheet unchanged in behaviour. Keep `EmptyState` branch.
- [ ] **Step 2: PDP** per spec §6.1: breadcrumbs [Trang chủ, Sản phẩm, product name]; `lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]`; gallery `lg:sticky lg:top-[var(--sticky-top)]`; buy column without card wrapper, delivery promise in one `SurfaceCard`; `TrustBar`; `Section title="Sản phẩm liên quan"` with `ProductGrid`. All `useState` lines and handlers unchanged.
- [ ] **Step 3: Verify**: `pnpm run validate`; browser `/catalog` and a PDP at desktop/375px/320px/dark — sticky gallery and filter sit below the header; mobile filter Sheet opens and closes; protected-path check empty.
- [ ] **Step 4: Commit** `style(catalog): flat filters and retail product detail`.

### Task 6: Cart, checkout, payment result

**Files:**

- Test (new, written first): `src/app/(storefront)/cart/__tests__/cart-page.test.tsx`, `src/app/(storefront)/checkout/__tests__/checkout-page.test.tsx`
- Modify: `src/app/(storefront)/cart/page.tsx`, `src/app/(storefront)/checkout/page.tsx`, `src/app/(storefront)/payment/[id]/page.tsx`, `src/components/storefront/cart-line-item.tsx`, `src/components/storefront/order-totals.tsx`

**Interfaces:**

- Consumes: `PageShell`, `SurfaceCard`, `TrustBar`.

- [ ] **Step 1: Write characterization tests against the current pages** (they must pass before any restyle):
  - Cart `blocks checkout while a line is unavailable`: `getByRole("button", { name: /Tiếp tục checkout/ })` toBeDisabled; `getByText("Có sản phẩm đang chặn checkout")` present; `queryByRole("link", { name: /Tiếp tục checkout/ })` null.
  - Checkout `keeps ordering locked until the address is complete`: `getByRole("button", { name: "Giữ hàng và đặt hàng" })` toBeDisabled; `getByText("Thiếu thông tin địa chỉ")` present.
  - Checkout `recomputes the total when express shipping is chosen`: total text matches `/637\.000/` (627.000 + 30.000 − 20.000); after `userEvent.click(getByLabelText(/Nhanh/))` it matches `/667\.000/`.
  - Mock `useVietnamAddresses` via `vi.mock("@/hooks/use-vietnam-addresses")` returning `{ provinces: [], wards: [], loading: false }`.
- [ ] **Step 2: Run** `pnpm exec vitest run "src/app/(storefront)/cart" "src/app/(storefront)/checkout"` → PASS on the unchanged pages. If any fails, fix the test, not the page.
- [ ] **Step 3: Restyle** cart and checkout per spec §6.1: `PageShell`, `lg:grid-cols-[minmax(0,1fr)_22.5rem]`, all cart lines inside one `SurfaceCard padded={false}` with `divide-y`, summary aside `lg:sticky lg:top-[var(--sticky-top)]`, CTAs `rounded-[var(--r-md)] min-h-11`. `CartLineItem` remove button gains `aria-label={`Xoá ${name}`}` (it has no accessible name today). Payment result: centred `SurfaceCard` in `PageShell width="narrow"`. Only JSX/className change.
- [ ] **Step 4: Run** the characterization tests again → PASS unchanged; `pnpm run validate` passes.
- [ ] **Step 5: Browser check** `/cart`, `/checkout`, `/payment/<id>` desktop/375px/dark; summary sits below the header when sticky; protected-path check empty.
- [ ] **Step 6: Commit** `style(cart): single-panel cart and checkout with sticky summary` (tests + pages together).

### Task 7: Account shell, profile, security, address book

**Files:**

- Modify: `src/app/(storefront)/account/layout.tsx`, `src/components/storefront/account-sidebar.tsx`, `src/components/storefront/account-nav-items.ts` (keep `description` field, stop rendering it), `src/features/customer/profile/components/customer-profile-form.tsx`, `src/features/customer/security/components/change-password-form.tsx`, `src/features/customer/address/components/{address-book-screen,address-book,address-book-states}.tsx`, `src/app/(storefront)/account/addresses/loading.tsx`

**Interfaces:**

- Consumes: `Breadcrumbs`, `SurfaceCard`, `accountNavItems`.
- Produces: `AccountBreadcrumbs()` (client, in `account-sidebar.tsx`) — [Trang chủ, Tài khoản, active item label]; on `/account` the trail is [Trang chủ, Tài khoản].

- [ ] **Step 1: Account layout**: outer container `py-5 lg:py-6`, grid `lg:grid-cols-[15rem_minmax(0,1fr)]`, `AccountBreadcrumbs` above content; sidebar sticky `top-[var(--sticky-top)]`, one-line items (no description), header block compact.
- [ ] **Step 2: Profile/security forms**: keep the existing `<section>` element and swap its class string for the `SurfaceCard` classes (no new imports into feature files), heading `text-xl`, fields grid `lg:grid-cols-2` where two fields sit side by side. Do not touch any line containing `form.`, `use`, `on`, `aria-`, `id=`, `htmlFor`, `role`.
- [ ] **Step 3: Address book**: card grid `md:grid-cols-2`, default address `border-accent`, edit/delete grouped in a footer row; skeletons match the grid.
- [ ] **Step 4: Verify**: existing tests `pnpm exec vitest run src/features/customer` → PASS without edits; `pnpm run validate`; browser `/account`, `/account/security`, `/account/addresses`, `/account/addresses/new` desktop/375px/dark; protected-path check empty.
- [ ] **Step 5: Commit** `style(account): compact account shell, forms and address grid`.

### Task 8: Orders list and order detail

**Files:**

- Modify: `src/components/storefront/order-card.tsx`, `src/features/order/components/{orders-screen,order-detail-screen,order-detail-sections,order-states,order-status-hero,order-help-card}.tsx`

**Interfaces:**

- `OrderCard` props unchanged.

- [ ] **Step 1: Orders list**: status filter rendered as an underline tab bar (same elements, same handlers, same `aria-*`); `OrderCard` compact layout per spec §6.2 (header row / thumbnails row / footer row), list `space-y-3`.
- [ ] **Step 2: Order detail**: `lg:grid-cols-[minmax(0,1fr)_21rem]`; left: status hero, stepper, items; right aside `lg:sticky lg:top-[var(--sticky-top)]`: payment summary, shipping address, `OrderHelpCard`. Mobile order unchanged. Skeletons in `order-states.tsx` mirror the two columns.
- [ ] **Step 3: Verify**: `pnpm exec vitest run "src/app/(storefront)/account/orders" src/features/order` → PASS without edits; `pnpm run validate`; browser `/account/orders`, `/account/orders/<id>` desktop/375px/dark, including the error and empty states if reachable via mock; protected-path check empty.
- [ ] **Step 4: Dispatch `architecture-reviewer`** on `git diff main -- src/features` with the Global Constraints feature-`.tsx` rule; fix any non-UI line it reports.
- [ ] **Step 5: Commit** `style(order): compact order cards and two-column order detail`.

### Task 9: Design and chat

**Files:**

- Modify: `src/app/(storefront)/design/page.tsx`, `src/app/(storefront)/design/[id]/page.tsx`, `src/features/product-design/components/*.tsx` (density only), `src/app/(storefront)/chat/page.tsx`, `src/app/(storefront)/chat/[id]/page.tsx`, `src/components/storefront/{chat-bubble,chat-composer}.tsx`

- [ ] **Step 1: Design list**: `PageShell` + breadcrumbs, grid of design cards (thumbnail, name, existing `StatusBadge`), `sm:grid-cols-2 lg:grid-cols-3`. Editor: token-driven density only; preflight/Confirmed gating untouched.
- [ ] **Step 2: Chat list**: `PageShell width="narrow"`, one `SurfaceCard padded={false}` with `divide-y` rows (letter avatar, name, last message, unread bubble), static SLA note "Phản hồi trong ~15 phút giờ hành chính". Chat detail: density only.
- [ ] **Step 3: Verify**: `pnpm run validate`; browser `/design`, a design detail, `/chat`, a chat detail at desktop/375px/dark; protected-path check empty.
- [ ] **Step 4: Commit** `style(design): retail layout for design and chat pages`.

### Task 10: Final sweep

- [ ] **Step 1:** Protected-path check → empty. `git diff --stat main -- src/components/ui` → empty.
- [ ] **Step 2:** `grep -rnE "#[0-9a-fA-F]{3,6}\b|[0-9]+px" src/app src/components src/features --include=*.tsx` → no new hits compared with `main`.
- [ ] **Step 3:** `pnpm run validate` → passes; test count = 194 + new tests.
- [ ] **Step 4:** Browser sweep of every route at 320px: `scrollWidth <= innerWidth` on each.
- [ ] **Step 5:** Dispatch `design-reviewer` on the full branch diff; fix confirmed findings in a final `style:` commit.
