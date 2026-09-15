# [StockFlow Storefront] Production Frontend Rules

> File thứ hai của design system storefront. `FRONTEND-AI-RULES.md` = **trông như thế nào** (token, component, layout). File này = **code như thế nào cho production** (kiến trúc, data layer, validation, state, permission, testing, CI).
>
> **Khi hai file mâu thuẫn về nghiệp vụ → `docs/` thắng. Khi mâu thuẫn về kỹ thuật → file này thắng.**
> Nguồn sự thật nghiệp vụ: `D:\FPTU\Capstone\docs\docs\` (module 12–18, `00-system-overview`, `glossary`, `open-questions`).
> App: `stockflow-storefront` — **chỉ mảng B (TMĐT)**, tách khỏi back-office `stockflow-ui`.

---

## 0. Nguyên tắc bất di bất dịch

1. **Mỗi `BR-xx` trong docs phải truy vết được trong code.** Validate nghiệp vụ → `zod.refine` kèm comment `// BR-xx (14-cart)`. Action-gating → transition table kèm comment BR. Không có rule "tự nghĩ ra".
2. **Component không biết data đến từ đâu.** Component nhận props typed. Data fetch ở hook `use*Query` / mutation ở `use*Mutation`. Không `import mock` trực tiếp vào page/component.
3. **Ba loại state, ba công cụ, không lẫn:** server state → React Query (`@tanstack/react-query`); UI state toàn cục → zustand; filter/sort/pagination/tab → **URL search params (`nuqs`)**. Không dùng `localStorage` cho filter danh sách.
4. **Type là tường lửa biên giới.** Response API qua `zod.parse` trước khi vào React. Không `any`, không `as unknown as`, không `@ts-ignore`.
5. **Không nghiệp vụ trong render.** Không `.filter()`/`.reduce()` tính tổng/KPI trong component. Vào `selectors` (pure, test được).
6. **Docs thay đổi → code thay đổi cùng lượt.** Thêm trạng thái mới: cập nhật union type, `status-map.ts`, transition table, mock, test — trong **một commit**.
7. **Không bịa con số.** Số liệu demo derive từ data thật (mock hoặc API). Không hardcode `1245 đơn` trong JSX.
8. **Một giá trị — một chỗ.** Chuỗi/số/route/status dùng ≥ 2 lần phải ở `src/constants/` (§15.2). Component không chứa literal nghiệp vụ.
9. **Import theo thứ tự cố định** (§15.1) — ESLint enforce.
10. **Không `any`** — tường minh lẫn ngầm (§15.3). "Không biết type" → `unknown` rồi narrow.

---

## 1. Kiến trúc thư mục (feature-based, storefront)

```
src/
├── app/
│   └── (storefront)/
│       ├── layout.tsx                  # <StorefrontShell>
│       ├── page.tsx                    # trang chủ — mỏng, chỉ compose
│       ├── catalog/
│       │   ├── page.tsx                # ~40 dòng: <CatalogList />
│       │   ├── loading.tsx  error.tsx
│       ├── product/[slug]/page.tsx
│       ├── design/[id]/page.tsx  design/new/page.tsx
│       ├── cart/page.tsx
│       ├── checkout/{shipping,payment,review}/page.tsx
│       ├── payment/[id]/page.tsx
│       ├── chat/page.tsx  chat/[id]/page.tsx
│       └── account/{profile,orders,orders/[id],addresses,security,privacy}/page.tsx
├── features/                           # ★ NGHIỆP VỤ SỐNG Ở ĐÂY (1 feature = 1 module docs)
│   ├── design/                         # module 12
│   ├── catalog/                        # module 13
│   ├── cart/                           # module 14 (+ checkout)
│   ├── payment/                        # module 15
│   ├── chat/                           # module 16
│   ├── order/                          # module 17
│   └── customer/                       # module 18
│       ├── api.ts                      # axios calls
│       ├── schemas.ts                  # zod DTO + Input (+ BR refines)
│       ├── types.ts                    # z.infer
│       ├── queries.ts                  # use*Query + queryKeys
│       ├── mutations.ts                # use*Mutation + invalidation
│       ├── lifecycle.ts                # *_TRANSITIONS + allowedActions
│       ├── selectors.ts                # PURE (tính tổng giỏ, gộp timeline…)
│       ├── components/                 # page-level, kebab-case file
│       └── index.ts                    # public API
├── constants/                          # ★ TẦNG THẤP NHẤT — không import gì từ src/
│   ├── index.ts routes.ts statuses.ts table.ts storage-keys.ts brand.ts
│   ├── labels.ts numbers.ts api-paths.ts query-keys.ts
├── components/{ui,shared,storefront}/
├── lib/{api,auth,domain,format,store,validation}/  cn.ts utils.ts
├── hooks/                              # use-url-filters, use-debounced-value, use-mobile, use-page-config
├── providers/app-providers.tsx
└── test/{setup.ts,mocks/handlers.ts,render.tsx}
```

**Quy tắc đặt tên:** folder feature = kebab-case trùng module docs (`cart` ↔ `docs/ecommerce/14-cart-checkout`). File component **kebab-case** (`catalog-list.tsx`), export PascalCase. Mỗi file feature ≤ 200 dòng; component ≤ 150 dòng.

**Import boundaries** (`eslint-plugin-boundaries` / `import/no-restricted-paths`):
- `features/A` KHÔNG import `features/B` — dùng `lib/domain` hoặc prop qua page.
- `components/shared` KHÔNG import `features/*` hay `lib/api/*`.
- `app/**/page.tsx` chỉ import `features/*` + `components/*`.
- `constants/*` KHÔNG import bất cứ gì từ `src/` (kể cả nhau ngoài barrel).

---

## 2. Data layer — axios + React Query

### 2.1 axios client

```ts
// lib/api/client.ts
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // cookie auth
});
api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<ApiErrorBody>) => Promise.reject(ApiError.from(err)),
);
```

`ApiError` chuẩn hoá `{ status, code, message, fieldErrors?, traceId? }`. `fieldErrors` map thẳng vào RHF `setError` (§4.4).

### 2.2 Query convention

```ts
// features/cart/queries.ts
export const cartKeys = {
  all: ["cart"] as const,
  detail: (id: string) => [...cartKeys.all, "detail", id] as const,
};
export function useCart(id: string) {
  return useQuery({
    queryKey: cartKeys.detail(id),
    queryFn: ({ signal }) => getCart(id, signal),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
```

| Query | staleTime | gcTime | refetchOnWindowFocus |
|-------|-----------|--------|----------------------|
| Catalog list (PLP) | 60s | 5m | false |
| Product detail (PDP) | 60s | 10m | true |
| Cart / Checkout | 0–10s | 5m | true |
| Order list/detail | 30s | 5m | true |
| Tracking (webhook-driven) | 10s | 2m | true |
| Master data (facets, provinces) | 10m | 30m | false |

**Server-side pagination/filter/sort là mặc định** cho PLP & order list. Params: `{ page, pageSize, sort, category[], color[], priceMin, priceMax, rating, q }`. Không fetch toàn bộ rồi filter client.

### 2.3 Mutation + invalidation (theo liên kết module docs)

```ts
// features/cart/mutations.ts
export function useConfirmDesign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmDesignInput) => confirmDesign(input),
    onSuccess: (_d, v) => {
      // docs 12 §7: Design Confirmed → mới cho Add to Cart
      qc.invalidateQueries({ queryKey: designKeys.detail(v.designId) });
      toast.success("Đã xác nhận thiết kế");
    },
    onError: (e: ApiError) => toast.error("Không xác nhận được", { description: e.message }),
  });
}
```

| Mutation | Invalidate | Nguồn docs |
|----------|-----------|-----------|
| Design Confirm | design detail | 12 §7 |
| Add to cart / update qty | cart detail | 14 |
| Apply voucher | cart detail (tính lại total) | 14 |
| Place order | order list, cart (clear), payment | 14→15 |
| Payment confirm/retry | payment, order detail | 15 §7 |
| Order cancel / amend | order detail+list, payment (hoàn) | 17 |
| RMA / return request | order detail, rma | 17 |
| Update profile/address/consent | customer, address book | 18 |

**Optimistic update:** chỉ cho toggle UI thuần (wishlist, qty stepper phản hồi tức thì) — **không** optimistic cho transition trạng thái đơn/thanh toán (để server quyết, tránh lệch BR).

### 2.4 Mock adapter (chạy song song khi chưa có API)

`NEXT_PUBLIC_USE_MOCK=true` → `api.defaults.adapter = mockAdapter` (route → đọc mock, delay 200–500ms, ~5% lỗi ngẫu nhiên, trả `fieldErrors` cho 4xx). Mock chỉ được adapter này import — không nơi khác. Component/hook **không đổi một dòng** khi backend thật sẵn sàng.

---

## 3. Types & Zod schemas — BR traceable

### 3.1 Hai lớp schema

```ts
// features/order/schemas.ts
export const OrderDto = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  customerId: z.string(),
  status: OrderStatusSchema,          // union từ docs 17 §5 — NGUYÊN VĂN
  currency: z.enum(["VND", "USD"]),
  lines: z.array(OrderLineDto).min(1),
  grandTotal: z.number(),
}).strict();                          // field lạ → lỗi (bắt contract drift)

export const CheckoutInput = z.object({
  addressId: z.string().min(1, "Chọn địa chỉ giao hàng"),
  shippingMethod: z.string().min(1),
  lines: z.array(CartLineInput).min(1, "Giỏ hàng trống"),
}).superRefine((v, ctx) => {
  // BR (14): dòng hết tồn → chặn checkout
  // ...refine kèm comment cite docs
});
```

Status enum sinh từ **cùng nguồn** với `status-map.ts` (`src/constants/statuses.ts`), không lệch. Union storefront cần bổ sung: `ORDER`, `PAYMENT`, `DESIGN`, `CONVERSATION`, `RMA`, `CART`, `PRODUCT`(publish) — hiện `constants/statuses.ts` mới có nhóm back-office; **thêm nhóm ecommerce cùng lượt** khi build feature tương ứng, giữ đúng docs.

### 3.2 Parse tại biên

```ts
// features/catalog/api.ts
export async function listProducts(p: PlpParams, signal?: AbortSignal) {
  const { data } = await api.get(API_PATHS.products, { params: p, signal });
  return z.object({
    items: z.array(ProductCardDto),
    total: z.number(), page: z.number(), pageSize: z.number(),
  }).parse(data);
}
```

Zod throw → React Query `error` → `error.tsx` hiển thị "Dữ liệu không đúng định dạng" + traceId. Không silent fallback.

### 3.3 Validation primitives + BR bắt buộc encode

```ts
// lib/validation/primitives.ts
export const vnd = (msg = "Số tiền không hợp lệ") => z.number().int(msg).nonnegative(msg);
export const phoneVN = z.string().regex(/^(0|\+84)\d{9}$/, "Số điện thoại không hợp lệ");
export const email = z.string().email("Email không hợp lệ");
```

| BR (storefront) | Schema / gating |
|-----------------|-----------------|
| 12 — Add to cart chỉ khi Design `Confirmed` | action-gating (§6) |
| 12 — Preflight `Fail` chặn Confirm | disable nút theo preflight state |
| 14 — dòng hết tồn chặn checkout | `superRefine` + UI block |
| 14 — giá đổi giỏ↔checkout cần xác nhận | mutation trả 409 → dialog xác nhận |
| 15 — không lưu số thẻ (PCI-DSS) | schema chỉ giữ `brand` + `last4` |
| 17 — amendment gating theo trạng thái đơn | transition table + `allowedActions` |
| 18 — email là khoá định danh, VN 3 cấp địa chỉ | `email` unique refine, cascading select |

---

## 4. Forms — react-hook-form + zodResolver

```tsx
const form = useForm<CheckoutInput>({
  resolver: zodResolver(CheckoutInput),
  mode: "onBlur",
  defaultValues: { lines: [] },
});
```

- Mọi input qua shadcn `<FormField>`/`<Controller>` — không `onChange` tay vào local state.
- Label `htmlFor`, error `aria-describedby`, input lỗi `aria-invalid`.
- Auto-focus field đầu; `Esc` đóng dialog; `Enter` submit (trừ textarea). Submit `disabled={!isValid || mutation.isPending}` + spinner. Dirty-guard khi rời trang.
- **Wizard checkout (14):** mỗi step một schema zod; `Next` chỉ validate step hiện tại; state wizard `useRef` + context (không zustand, không URL — tránh nhảy step); submit 1 lần ở cuối.
- **AddressForm (18):** cascading tỉnh/huyện/xã — mỗi cấp phụ thuộc cấp trên, reset cấp dưới khi đổi cấp trên.
- **Lỗi server:** `e.fieldErrors` → `form.setError(field, ...)`; 409 (giá đổi/hết tồn) inline đúng field, không toast chung.

---

## 5. State management — ranh giới rõ

| Loại state | Công cụ | Ví dụ |
|-----------|---------|-------|
| Server state | **React Query** | catalog, cart, order, tracking |
| UI toàn cục | **zustand** | theme, locale, mute, (giỏ hàng client-side nếu guest) |
| UI cục bộ | `useState` | dialog, drawer filter mở/đóng |
| Filter/sort/page | **URL (`nuqs`)** | `?category=ao&color=den&priceMin=100000&sort=-price&page=2` |
| Sở thích hiển thị | zustand + `persist` | grid/list view, sort mặc định (KHÔNG phải filter) |
| Form | RHF | — |

Đổi filter → `setPage(1)`. Lợi ích: share link, F5 giữ nguyên, back/forward đúng. Dùng `hooks/use-url-filters.ts` (nuqs wrapper) cho PLP & order list.

---

## 6. State machine & action-gating (docs là nguồn)

```ts
// lib/domain/lifecycle.ts — ĐÃ có barrel; bổ sung bảng ecommerce
export const DESIGN_TRANSITIONS = { /* docs 12 §5 */ } as const;
export const ORDER_TRANSITIONS = { /* docs 17 §5 */ } as const;
export const PAYMENT_TRANSITIONS = { /* docs 15 §5 */ } as const;
export const RMA_TRANSITIONS = { /* docs 17 */ } as const;
export const CONVERSATION_TRANSITIONS = { /* docs 16 */ } as const;

export const isTerminal = <S extends string>(t: Record<S, readonly S[]>, s: S) => t[s].length === 0;
export const canTransition = <S extends string>(t: Record<S, readonly S[]>, from: S, to: S) =>
  (t[from] as readonly string[]).includes(to);
```

Action descriptor thay if/else rải JSX; JSX chỉ còn `{actions.map(a => <ActionButton key={a.id} {...a} />)}`. Trạng thái terminal → mảng rỗng → không render nút mutating. `<ActionButton>` tự xử lý `ConfirmDialog` cho `destructive`, `disabled` khi pending, toast.

**Gating storefront cốt lõi:** Add-to-cart chỉ khi Design `Confirmed` (12); Preflight `Fail` chặn Confirm (12); checkout chặn khi có dòng hết tồn (14); order amendment/cancel theo trạng thái đơn (17); payment retry chỉ khi `Failed` (15).

---

## 7. Permission & Role

`lib/auth/` đã có: `roles.ts` (Role Registry), `permissions.ts` (`PERMISSIONS`, `can`, `permissionsFor`), + `Can`/`RoleSwitcher`/auth-store (dùng cho demo).

- Storefront chủ yếu phục vụ **khách hàng**; `ROLES` hiện là roles back-office (`00-system-overview §2`) và **chưa có `"Customer"`**. Khi cần gating rõ vai khách → **thêm `"Customer"` vào `roles.ts` cùng lượt** (đồng bộ docs), không hardcode chuỗi.
- Phần có góc nhìn nhân viên (chat reply của `Sales Staff`, điều phối `Order Coordinator`): dùng `<Can perm="...">`/`useCan`. **UI-only**: ẩn/disable; luôn kèm comment `// Backend phải re-check`. Internal note (16) chỉ render khi có quyền Sale — không lộ phía khách.

---

## 8. Error, loading, empty — mọi trạng thái đều có UI

| Trạng thái | Xử lý |
|-----------|-------|
| Loading lần đầu | `<Skeleton>` đúng shape (grid card cho PLP), không spinner trắng |
| Refetch nền | thanh progress mảnh, không che nội dung |
| Empty (chưa có) | `<EmptyState>` + CTA ("Giỏ trống — Khám phá sản phẩm") |
| Empty (filter rỗng) | "Không tìm thấy" + "Bỏ bớt bộ lọc" + sản phẩm phổ biến |
| Product `Unpublished` | trang "sản phẩm không còn khả dụng" + gợi ý tương tự (13) |
| Error 4xx | `<Alert>`/`error.tsx` + "Thử lại"; 403 → "Bạn không có quyền" |
| Error 5xx/network | "Không kết nối được máy chủ" + traceId + Retry |
| Zod parse fail | "Dữ liệu trả về không đúng định dạng" (bug contract, log + traceId) |
| Mutating pending | nút disabled + spinner; chặn double-submit |
| Offline | banner "Mất kết nối" |

Bắt buộc `loading.tsx`/`error.tsx`/`not-found.tsx` ở các route nhóm storefront. `QueryClient`: `retry: 2` (backoff), **không retry** 4xx.

---

## 9. Performance

1. **RSC mặc định.** `page.tsx` là Server Component; `"use client"` chỉ cho file cần (PLP filter, form, canvas, chart). Prefetch server (`queryClient.fetchQuery`) tránh waterfall.
2. **Code-split:** `next/dynamic` cho `design-canvas`, `LivePreview3D` (three.js), chart. Fallback 2D theo §4.2 FRONTEND-AI-RULES.
3. Ảnh: `next/image`, `sizes` đúng, AVIF/WebP, blur placeholder cho PDP.
4. Debounce search 300ms; abort query cũ bằng `AbortSignal`.
5. `useMemo`/`useCallback` chỉ khi có bằng chứng profiler. Không memo phòng thân.
6. **Ngân sách (storefront mobile 4G):** LCP < 2.5s, INP < 200ms, JS route đầu < 200KB gzip. Đọc `next build` report mỗi PR.

---

## 10. Format tiền / ngày / số — MỘT chỗ

```ts
// lib/format/money.ts (hoặc number.ts đã có)
export const formatMoney = (amount: number, currency: Currency = "VND") =>
  new Intl.NumberFormat(currency === "USD" ? "en-US" : "vi-VN",
    { style: "currency", currency }).format(amount);
// lib/format/date.ts — luôn timeZone "Asia/Ho_Chi_Minh", locale vi-VN
```

Tiền **luôn** từ field `currency` của record. Giá storefront: `tabular-nums`, `<PriceDisplay>`/`<OrderTotals>` là nơi duy nhất render giá + % giảm. Không nhân bản `formatVND` trong page.

---

## 11. Testing

```bash
pnpm add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom msw@2 @vitest/coverage-v8
```

| Loại | Phạm vi | Công cụ |
|------|---------|---------|
| Unit | `selectors.ts`, `lifecycle.ts`, `format/*`, zod schemas | Vitest |
| Component | `StatusBadge`, `ProductCard`, `QuantityStepper`, `CheckoutStepper`, `ActionButton` | RTL + jsdom |
| Feature | PLP (filter→URL→grid), PDP (variant→giá/tồn), Checkout wizard, Order detail (amendment gating) | RTL + MSW |
| Contract | Zod parse fixture JSON thật | Vitest |
| E2E (sau) | Catalog→Design→Cart→Checkout→Payment | Playwright |

**Test bắt buộc:** transition table (Design/Order/Payment), action-gating (add-to-cart khi Confirmed, cancel disable sau Shipped), checkout block khi hết tồn. Coverage `lib/domain/*` + `features/*/{selectors,schemas,lifecycle}` ≥ 90%; component ≥ 70%. `test/mocks/handlers.ts` (MSW) build từ cùng nguồn mock.

---

## 12. Tooling & CI

Scripts (`package.json`, **pnpm**): `dev` (`next dev --turbopack`), `build`, `lint` (`eslint src --max-warnings 0`), `format`, `typecheck` (`tsc --noEmit`), `test`/`coverage` (vitest), `validate` = `pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build`. `prepare: husky`.

`.husky/pre-commit` → `lint-staged`: `*.{ts,tsx}` → `eslint --fix --max-warnings 0` + `prettier --write` + `vitest related --run`. `.husky/commit-msg` → `commitlint` (conventional). Scope theo module: `feat(cart): thêm voucher`, `fix(payment): retry theo BR`, `docs(rules): cập nhật transition`.

**GitHub Actions** mỗi PR: `typecheck → lint → test --coverage → build`; fail nếu coverage `lib/domain` < 90%. Cache `pnpm store` + `.next/cache`. Grep chống regression:

```bash
! grep -rnE "#[0-9a-fA-F]{6}" src/app src/components src/features || exit 1   # cấm hex trần
! grep -rnE ":\s*any\b|<any>|as any" src --include="*.ts" --include="*.tsx" || exit 1
! grep -rn "@ts-ignore" src || exit 1
! grep -rn "from \"@/" src/constants || exit 1                               # constants tầng thấp nhất
```

---

## 13. Refactor / build playbook (mỗi module 1 PR)

| Bước | Việc | Kiểm chứng |
|------|------|-----------|
| 1 | `features/<module>/` + `schemas.ts` (zod + BR comment) | `pnpm typecheck` |
| 1b | Dồn literal vào `constants/` (status, labels, routes, columns, storage keys) | grep sạch page |
| 2 | `lifecycle.ts` — chép "Chuyển tiếp cho phép" từ docs + test | `vitest related` pass |
| 3 | `api.ts` + `queries.ts` + `mutations.ts` + route mock-adapter | chạy `NEXT_PUBLIC_USE_MOCK=true` |
| 4 | Tách page: filter/tổng/format → `selectors` + `lib/format` + `use-url-filters`; JSX → `components/` | page ≤ 60 dòng |
| 5 | Action-gating: `allowedActions(status, role)` + `<ActionButton>` | test gating |
| 6 | `loading.tsx` + `error.tsx` + 2 EmptyState | tắt mạng / URL sai → UI đúng |
| 7 | filter → URL (nuqs); view-prefs → zustand persist | F5 + copy URL giữ state |
| 8 | A11y pass: focus-visible, aria, contrast, keyboard (gallery/variant/stepper) | axe 0 violation |
| 9 | `pnpm run validate` + đối chiếu preview | build pass |

**Ưu tiên:** 14 Cart/Checkout, 15 Payment, 12 Design (nhiều gating/BR nhất) trước; 13 Catalog, 16 Chat, 17/18 sau. **Cấm khi refactor:** đổi tên field/status mock, đổi token màu, sửa `components/ui/*`, gộp 2 module vào 1 feature.

---

## 14. Checklist "production-ready" mỗi module

- [ ] `features/<module>/` đủ file (api, schemas, types, queries, mutations, lifecycle, selectors) + components tách.
- [ ] Mọi `BR-xx` liên quan có trong zod refine / transition table / test, kèm comment cite docs.
- [ ] Mọi trạng thái docs có trong transition table; terminal không có nút mutating.
- [ ] Action-gating test pass (add-to-cart, checkout block, cancel/amend).
- [ ] Mock chỉ import trong adapter (CI grep pass).
- [ ] Filter/sort/page trên URL; không localStorage cho filter.
- [ ] `loading.tsx` + `error.tsx` + 2 EmptyState; offline banner.
- [ ] Tiền/ngày/số qua `lib/format`.
- [ ] Không `any`, không hex trần, không `!important`; typecheck + lint 0 warning.
- [ ] Import đúng thứ tự §15.1; `import type` tách; `constants/` không import ngược.
- [ ] Không literal nghiệp vụ: route → `STORE_ROUTES`, nhãn → `UI_LABELS`, status → `*_STATUS`, ngưỡng → `constants/numbers.ts`.
- [ ] Test: lifecycle, selectors, 1 list (PLP), 1 detail (PDP/order), 1 form (checkout); coverage domain ≥ 90%.
- [ ] Dark mode + focus-visible + reduced-motion + responsive (**mobile-first 320→1440**).
- [ ] `pnpm run validate` pass.
- [ ] Giả định chưa chốt → comment `// ASSUMPTION (open-question Xn)`.

---

## 15. Import order · Constants · No hardcode · No `any`

### 15.1 Thứ tự import (ESLint enforce)

8 nhóm cách nhau một dòng trống, trong nhóm sắp alphabet:

```tsx
"use client";                                        // ① directive

import { useMemo, useState } from "react";           // ② external
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { STORE_ROUTES, PAGE_SIZE, UI_LABELS } from "@/constants";  // ③ alias: constants trước
import { formatMoney } from "@/lib/format";
import { toneOf } from "@/lib/domain/status-map";
import { useUrlFilters } from "@/hooks/use-url-filters";

import { StatusBadge } from "@/components/shared/status-badge";     // ④ components
import { ProductCard } from "@/components/storefront/product-card";

import { computeCartTotals } from "../selectors";    // ⑤ nội bộ feature

import { CatalogFilters } from "./catalog-filters";  // ⑥ cùng cấp

import type { PlpParams } from "../types";           // ⑦ type-only — cuối

import "./globals.css";                              // ⑧ side-effect (layout/providers)
```

- `import type` **không trộn** với `import` thường (`consistent-type-imports`, `separate-type-imports`).
- Alias `@/*` duy nhất; không path tương đối vượt 2 cấp.
- `components/ui/*` (shadcn) giữ nguyên bản.
- `cn()` từ `@/lib/cn` hoặc `@/lib/utils` — không import gói `cn` ngoài.

### 15.2 Không hardcode — literal vào `src/constants/`

| Loại | ❌ | ✅ |
|------|----|----|
| Route | `router.push("/catalog")` | `STORE_ROUTES.catalog.list` |
| Nhãn UI | `<Button>Thêm vào giỏ</Button>` | `{UI_LABELS.cart.addToCart}` |
| Trạng thái | `status === "Pending Payment"` | `ORDER_STATUS.PENDING_PAYMENT` |
| Page size | `pageSize={24}` | `PAGE_SIZE.lg` |
| Ngưỡng/tiền | `>= 1_000_000` | `VND.TRIEU` |
| Storage key | `"stockflow:store:view"` | `STORAGE_KEYS.storeView` |
| Query key | `["cart", id]` trong component | `cartKeys.detail(id)` |
| Màu/radius | `#1e88e5`, `rounded-[6px]` | `text-accent`, `rounded-[var(--r-sm)]` |
| Brand | chuỗi tên brand rải rác | `BRAND.name` / `BRAND.wordmark` |

Status enum là **nguồn sự thật duy nhất** trong `constants/statuses.ts` (nguyên văn docs, không dịch). `STORE_ROUTES` đã có trong `constants/routes.ts` — dùng lại, không hardcode path.

**Ngoại lệ literal:** chuỗi dùng đúng một lần tự giải thích (`aria-label="Đóng"`), fixture test, `0/1/-1/""/true/false` rõ nghĩa, chuỗi kỹ thuật lib (`"use client"`).

### 15.3 Không `any`

| Tình huống | ✅ |
|-----------|----|
| Không biết type | `unknown` + narrow (`if (isApiError(e))`) |
| `catch` | `catch (e: unknown)` + guard |
| JSON chưa biết shape | `Schema.parse(JSON.parse(raw))` |
| children | `React.ReactNode` |
| object động | `Record<string, unknown>` |
| ref | `useRef<HTMLDivElement>(null)` |
| event | `(e: React.ChangeEvent<HTMLInputElement>) => …` |

Cấm `as unknown as T` (trừ có lý do + issue), `@ts-ignore` (dùng `@ts-expect-error` + comment), non-null `!` (dùng guard/`??`). Ưu tiên `satisfies` hơn `as` cho hằng.

ESLint/TS enforce: `@typescript-eslint/no-explicit-any` + `no-unsafe-*` = error; `consistent-type-imports`; `no-non-null-assertion`; `no-floating-promises`. tsconfig: `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`.

---

## Phụ lục — Stack thực tế (đã cài trong `package.json`)

Next 16.3.4 · React 19.2 · Tailwind v4 · shadcn (radix-ui hợp nhất) · framer-motion 13 · lucide-react · @tanstack/react-query 5 · zod 4 · react-hook-form 7 + @hookform/resolvers 5 · axios 1 · zustand 5 · nuqs 2 · ts-pattern 5 · date-fns 4 · sonner 2 · cmdk · usehooks-ts · **pnpm 10**. Dev: vitest 5 + @testing-library + msw 2 + jsdom · eslint 9 + eslint-config-next · husky + lint-staged + commitlint · prettier + prettier-plugin-tailwindcss.

**Chưa cài (thêm khi cần, lazy):** `@tanstack/react-table` (chỉ khi cần DataTable cho order history), `three` + `@react-three/fiber` + `drei` (Live Preview 3D module 12 — lazy + fallback 2D), `konva`/`fabric.js` (DesignCanvas 2D module 12), `react-dropzone` (upload ảnh thiết kế), `eslint-plugin-boundaries`, `@axe-core/react` (dev), `recharts` (nếu có dashboard khách). **Không thêm:** Redux, GraphQL, XState.

---

_Cặp file đồng bộ với `FRONTEND-AI-RULES.md`. Cập nhật khi thêm tech, đổi kiến trúc, docs đổi BR/trạng thái._
