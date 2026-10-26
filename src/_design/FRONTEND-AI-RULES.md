# [StockFlow Storefront] Frontend AI System Rules

> File này là **hợp đồng thiết kế (design contract)** cho agent sinh code UI/UX của **storefront** (`stockflow-storefront`).
> Phạm vi: **chỉ mảng B — Sàn TMĐT (module 12–18)**. Đây là app **riêng biệt** với back-office (`stockflow-ui`); KHÔNG có route back-office ở đây.
> Trạng thái hiện tại: **UI/UX + mock data**. KHÔNG business logic thật, KHÔNG gọi API thật (mock adapter — xem `PRODUCTION-FRONTEND-RULES.md`).
> Tech stack thực tế: **Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · shadcn/ui (radix-ui) · Framer Motion · TypeScript · pnpm**.
> Nguồn sự thật nghiệp vụ: `D:\FPTU\Capstone\docs\docs\` (module 12–18, `00-system-overview`, `glossary`, `open-questions`).

---

## 0. Nguyên tắc bất di bất dịch (đọc trước tiên)

1. **Documentation-Driven.** Trước khi sinh bất kỳ UI nào, mở module tương ứng trong `docs/` và đọc 2 bảng: **"Trạng thái / Vòng đời"** và **"Ràng buộc nghiệp vụ (Business Rules) & Edge case"**. Đây là nguồn quyết định CTA nào `enable`/`disable`.
2. **Đây là app storefront thuần.** Mọi màn hình dùng **một design mode duy nhất — Mode B (compact retail, mobile-first)**. KHÔNG có mode data-dense back-office ở repo này. Không import/khôi phục pattern sidebar quản trị.
3. **Không tự bịa nghiệp vụ.** Logic nào không rõ → tra `docs/open-questions/`. Nếu chưa chốt → dùng mock data hợp lý và **đánh dấu giả định** bằng comment `// ASSUMPTION (open-question Xn): ...`.
4. **Mock data phải khớp docs.** Số lượng trạng thái, tên trạng thái (kèm tiếng Anh gốc), vòng đời phải **đúng y hệt** bảng trong module. Không rút gọn, không thêm trạng thái không có trong docs.
5. **Token trước, hardcode sau.** KHÔNG bao giờ viết màu hex / px trần trong component. Luôn dùng CSS variable token trong `globals.css` (mục 3) hoặc utility Tailwind đã map token (`bg-bg-surface`, `text-ink-primary`, `rounded-[var(--r-lg)]`…).
6. **Một trạng thái — một nguồn sự thật.** Mọi badge trạng thái đi qua **một** component `<StatusBadge>` + **một** file map (`lib/domain/status-map.ts`). Không tạo `OrderBadge`, `PaymentBadge`, `ChatBadge`… rời rạc.
7. **File component đặt tên kebab-case.** Repo này theo chuẩn `product-card.tsx`, `order-timeline.tsx` (KHÔNG PascalCase file). Export vẫn là `PascalCase` (`export function ProductCard()`). Giữ nhất quán với các file đã có trong `components/storefront/`.

---

## 1. Cấu trúc dự án & quy ước đặt tên

```
src/
├── app/
│   ├── (storefront)/             # nhóm route storefront, dùng StorefrontShell
│   │   ├── layout.tsx            # <StorefrontShell>
│   │   ├── page.tsx              # trang chủ
│   │   ├── catalog/  product/[slug]/  search/
│   │   ├── design/[id]/  design/new/
│   │   ├── cart/  checkout/{shipping,payment,review}/
│   │   ├── payment/[id]/
│   │   ├── chat/  chat/[id]/
│   │   └── account/{profile,orders,orders/[id],addresses,security,privacy}/
│   ├── layout.tsx                # Root: <ThemeProvider> + fonts + providers
│   └── globals.css               # @theme token + base layer (Mode B palette)
├── components/
│   ├── ui/                       # shadcn/ui nguyên bản (KHÔNG sửa tay — mục 8)
│   ├── shared/                   # component dùng chung TỰ viết (mục 6)
│   └── storefront/               # component riêng storefront (kebab-case file)
├── constants/                    # routes, statuses, table, storage-keys, brand
├── lib/
│   ├── api/                      # client, query-client, query-factory, error
│   ├── auth/                     # roles, permissions, auth-store, Can, RoleSwitcher
│   ├── domain/                   # status-map, lifecycle, types
│   ├── format/                   # date, number
│   ├── store/                    # zustand: use-app-store, use-table-prefs
│   ├── validation/               # primitives (zod)
│   └── cn.ts / utils.ts          # cn()
├── hooks/                        # use-url-filters, use-debounced-value, use-mobile, use-page-config
└── providers/                    # app-providers.tsx
```

**Quy ước đặt tên:**

| Loại | Quy ước | Ví dụ |
|------|---------|-------|
| Component file | `kebab-case.tsx` | `product-card.tsx`, `order-timeline.tsx` |
| Component export | `PascalCase` | `export function ProductCard()` |
| Constant/route file | `kebab-case.ts` | `routes.ts`, `storage-keys.ts` |
| Token / const | `SCREAMING_SNAKE` hoặc `camelCase` | `STORE_ROUTES`, `PAGE_SIZE` |
| Route group | `(kebab-case)` | `(storefront)` |
| Variant (CVA) | `camelCase` | `tone`, `size`, `availability` |

- Component dùng **`cva`** cho variant, **`cn()`** (`@/lib/cn` hoặc `@/lib/utils`) để merge class. Không nối chuỗi class thủ công.
- Props **đánh kiểu đầy đủ** (`interface Props`), `children: ReactNode` rõ ràng, không `any`.

---

## 2. Design mode — chỉ Mode B (Storefront)

Toàn bộ app chạy trên **một design mode: Storefront (TMĐT)** — khác hẳn back-office.

| Trục | **Mode B — Storefront (app này)** |
|------|-----------------------------------|
| Mật độ | **Compact retail**: `--card-pad` 16px mobile / 20px ≥ sm |
| Mục tiêu | Marketing, ưu tiên hình ảnh sản phẩm, gọn kiểu retail chuyên nghiệp |
| Danh sách | **Grid card** (`<ProductGrid>`), ít bảng, nhiều ảnh |
| Bo góc | `lg`/`xl` (12–16px) — mềm mại, thân thiện |
| Cường độ accent | Mạnh ở CTA mua hàng, giá, khuyến mãi |
| Typography | Lớn hơn ở heading sản phẩm/giá, gọn (compact retail); `tabular-nums` cho số/giá |
| Motion | Mượt, có chủ đích (200–320ms), reveal sản phẩm; tôn trọng `prefers-reduced-motion` |
| Thiết bị | **Mobile-first 100%** (khách hàng). Target chạm ≥ 44px. **Ngoại lệ:** trình thiết kế module 12 chỉ hỗ trợ desktop (§4.2) |
| Shell | `<StorefrontShell>` — dải thông báo + header 2 tầng sticky (search + danh mục) + footer đầy đủ + nút chat nổi (giỏ hàng nằm ở header) |

> **Quy tắc:** không tái tạo pattern back-office (sidebar cố định, DataTable data-dense, toolbar filter phức tạp) trong app này. Danh sách storefront ưu tiên grid + filter drawer trên mobile.

---

## 3. Design Tokens (nguồn sự thật cho màu/kích thước)

Token định nghĩa **một lần** trong `src/app/globals.css` (`:root` + `@theme inline`). Tailwind class sinh từ đây. **Không** đọc hex trực tiếp trong component.

### 3.1 Bảng màu — theme Ink + Blue (đã chốt cho repo này)

> **QUAN TRỌNG:** Storefront này dùng theme **Ink + Blue** (lạnh, sạch, hiện đại) — **KHÔNG dùng caramel**. Đây là quyết định đã chốt và đã phản ánh trong `globals.css`. Đừng khôi phục palette caramel từ tài liệu cũ.

**Nền & bề mặt / chữ (light → dark):**

| Token | Light | Dark | Vai trò |
|-------|-------|------|---------|
| `--bg-base` | `#f3f4f6` | `#0e0f11` | nền trang, app shell |
| `--bg-surface` | `#ffffff` | `#17181b` | card, panel |
| `--bg-subtle` | `#f7f8fa` | `#1f2124` | nền phụ, ảnh placeholder |
| `--bg-muted` | `#eef0f3` | `#2a2c30` | hover, selected nhẹ, disabled |
| `--border-default` | `#dadde1` | `#2e3034` | viền card, ô nhập |
| `--border-strong` | `#c5cad1` | `#3d4045` | viền focus, divider |
| `--ink-primary` | `#1a1b18` | `#f4f4f1` | chữ chính, heading |
| `--ink-secondary` | `#5c5e58` | `#a8aaa3` | mô tả, phụ đề |
| `--ink-tertiary` | `#8a8c85` | `#76786f` | placeholder, meta |
| `--ink-inverse` | `#ffffff` | `#1a1b18` | chữ trên nền brand/accent |
| `--brand` | `#1a1b18` | `#f4f4f1` | brand/CTA chính (ink) |
| `--brand-hover` | `#000000` | `#ffffff` | hover CTA |
| `--accent` | `#1e88e5` | `#4ea6f0` | link, nhấn thông tin, giá nổi bật |

**Semantic (trạng thái — dùng cho StatusBadge, alert, availability, preflight):**

| Token | Giá trị | Ý nghĩa |
|-------|---------|---------|
| `--positive` | `#1f9d55` | thành công, đã giao, còn hàng, Pass |
| `--info` | `#2b7fc4` | đang xử lý, đang giao, thông tin |
| `--warning` | `#d98207` | chờ, sắp hết, Warning preflight, awaiting confirmation |
| `--danger` | `#d23b3b` | lỗi, huỷ, hết hàng, Fail, thất bại thanh toán |
| `--neutral` | `#6b6e68` | nháp, trung tính, guest |
| `--muted` | `#9a9c95` | đã đóng, terminal, ẩn |
| `--special` | `#7c5cbf` | hoàn tiền, đang sản xuất/in |

> Badge render 3 sắc thái từ mỗi semantic: nền = tone@~12% alpha, chữ/icon = tone@100%, viền = tone@~24%. Xem mục 6.1.

### 3.2 Spacing (compact retail)

Scale 4px. Storefront dùng biến density compact retail:
- `--card-pad: 16px` mobile / `20px` từ `sm` (card sản phẩm/panel), `--el-gap: 12px` (gap phần tử).
- Section gap `32–48px`; hero khoảng trắng lớn.
- Padding container: `px-4 sm:px-6 lg:px-8`, `max-w-7xl` cho vùng nội dung chính.

### 3.3 Bo góc (radius)

| Token | px | Dùng |
|-------|----|----|
| `--r-sm` | 4 | badge nhỏ, chip |
| `--r-md` | 8 | input, button mặc định |
| `--r-lg` | 12 | **card sản phẩm, panel** (`--card-radius`) |
| `--r-xl` | 16 | modal, sheet, hero card |
| `--r-full` | 9999 | pill, avatar, badge tròn, CTA tròn |

### 3.4 Typography

- **Sans (UI + body):** `--font-sans` (Inter). Body `0.9375rem`, line-height `1.6`.
- **Display (heading lớn, giá):** `--font-display` (Inter Tight) cho hero, tên sản phẩm lớn, giá.
- **Mono:** `--font-mono` cho mã đơn, số vận đơn (AWB), SKU, giá cần canh cột (`tabular-nums`).

Quy tắc: giá tiền → `font-display`/lớn, weight 700, `tabular-nums`. Mã định danh → mono. Body ≤ ~68ch. Không all-caps cho label thường.

### 3.5 Bóng đổ

Storefront **được dùng bóng nhẹ** (khác back-office): card: border + `--sh-sm`; card sản phẩm hover nâng lên `--sh-md`, không translate. `--sh-md` cho dropdown/popover/sticky header; `--sh-lg` cho modal, sheet, nút chat nổi.

### 3.6 Z-index (cố định, không tự bịa)

`dropdown: 50 · sticky header: 40 · floating(cart/chat): 50 · overlay: 900 · modal: 1000 · drawer/sheet: 1100 · toast: 1200 · tooltip: 1300`

---

## 4. Kỹ năng UI — Storefront (module 12–18)

### 4.1 Phong cách chung

- **Minimalist, marketing-focused.** Ưu tiên hình ảnh sản phẩm (`next/image`, `sizes` đúng, `object-cover`). Khoảng trắng `lg`/`xl`.
- Bo góc `lg`/`xl`, bóng nhẹ, nhiều không gian thở.
- Accent brand (ink) mạnh ở CTA mua hàng; `accent` (blue) cho link/giá nhấn.
- **Mobile-first 100%.** Catalog & Cart responsive hoàn chỉnh, tối ưu chạm (≥ 44px). Filter → **drawer/sheet** trên mobile. Trừ trình thiết kế module 12: chỉ desktop (§4.2).

### 4.1.1 Quy chuẩn shadcn-first

- Mọi control tương tác phải dùng shadcn/ui (`components/ui/*`) hoặc shared component đã chuẩn hoá. Không viết raw `<button>`, `<input>`, `<select>`, `<textarea>`, custom dropdown/modal trong page-level nếu shadcn/shared đã đáp ứng.
- Mapping: raw `button` → `<Button>`; `input` → `<Input>`; `textarea` → `<Textarea>`; select đơn → `<Select>`; multi-select/facet → `<Popover>` + `<Command>` + `<Checkbox>`; modal/confirm → `<Dialog>`/`<ConfirmDialog>`; status → `<StatusBadge>`; tag → `<Badge>`.
- Ngoại lệ raw/native chỉ trong `components/ui/*` khi bọc radix/native primitive, element layout/semantic không có hành vi, hidden/file input, Next `<Link>/<Image>`, SVG/icon, primitive cần `asChild`.
- CTA mua hàng dùng `<Button>` mặc định (nền `brand`, chữ `ink-inverse`), bo góc `rounded-[var(--r-md)]`, cao `min-h-11` theo phong cách retail; `rounded-full` chỉ dùng cho chip/badge/icon button. Button phụ → `variant="outline"`/`secondary`; icon-only/floating → `variant` phù hợp + `size="icon"`.
- Với shadcn `<Select>` luôn có visible label; `<Checkbox>` convert `checked === true` trước khi ghi boolean.

### 4.2 Module 12 — Thiết kế 2D/3D (màn phức tạp nhất)

**Chỉ hỗ trợ desktop — không hỗ trợ mobile** (quyết định 26/10/2026):
- Trình thiết kế và màn bắt đầu (`/design/new`, `/design/[id]`) chỉ mở trên máy tính/laptop với cửa sổ **≥ 1024px**. Điện thoại, máy tính bảng (kể cả iPad, mọi hướng xoay) và cửa sổ hẹp hơn chỉ thấy thông báo _"Chức năng thiết kế chỉ hỗ trợ trên máy tính"_ (`DesktopOnlyGate`), kèm "Sao chép liên kết" và "Thiết kế của tôi".
- **Không** làm layout studio cho điện thoại hay máy tính bảng (không bottom-sheet, không xếp dọc). Các quy tắc mobile-first của tài liệu này không áp dụng cho studio; trang danh sách `/design` vẫn mobile-first.
- Thao tác cảm ứng chỉ giữ cho laptop cảm ứng (pinch zoom, vẽ một ngón).

Layout desktop **Canvas chia màn hình**:
- Thanh công cụ + tùy chọn công cụ (trái) · khung 2D (giữa) · **xem trước 3D ở cột rộng nhất**, chiếm phần lớn chiều cao, trên bảng Thuộc tính / Lớp / Kiểm tra (phải).
- Vùng 2D hiển thị **3 lớp guide**: `print area` (nét liền) → `safe area` (nét đứt trong) → `bleed` (nét chấm đỏ nhạt ngoài mép). Cảnh báo realtime (viền đỏ + toast) khi phần tử tràn print area / đè vùng cấm.
- **Toolbar (`<CanvasToolbar>`):** upload ảnh (validate định dạng/dung lượng/**DPI** → cảnh báo "ảnh mờ"), thêm text (font cho phép, cỡ, màu, canh), hình khối/clipart/template, kéo–thả/xoay/scale/canh.
- **Live 3D Preview:** map texture 2D lên model realtime; khách xoay/zoom. **Bắt buộc** disclaimer: _"Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"_. **Fallback:** WebGL lỗi → ảnh tĩnh; model lỗi → preview 2D phẳng + nhãn "preview 3D không khả dụng".
- **Preflight Report (`<PreflightReport>`):** `Pass`(xanh)/`Warning`(vàng)/`Fail`(đỏ) kèm lý do. `Fail` → **chặn nút Confirm**. `Warning` → cho qua kèm xác nhận rủi ro.
- **Action-gating:** nút **"Thêm vào giỏ" chỉ enable khi Design = `Confirmed`**. Sản phẩm tùy chỉnh KHÔNG thêm thẳng vào giỏ.
- Đổi variant → print area có thể đổi → kiểm tra lại layout, cảnh báo phần tử không hợp lệ.

### 4.3 Module 13 — Catalog (PLP/PDP)

- **PLP:** grid `<ProductCard>` (đã có), filter sidebar (desktop) / **drawer** (mobile), sort dropdown. Empty state khi rỗng → gợi ý từ khoá, nút "bỏ bớt bộ lọc", sản phẩm phổ biến.
- **Facets:** danh mục · màu (swatch) · chất liệu · giá (slider min/max) · đánh giá (sao). **Sort:** mới nhất · giá asc/desc · phổ biến.
- **PDP:** `<ImageGallery>` ảnh lớn, mô tả, `<VariantSelector>` (size/màu). Chọn variant → cập nhật **giá + tình trạng còn hàng** realtime. Variant hết hàng → swatch mờ/gạch + "hết hàng" (disabled).
- **CTA phân nhánh:** sản phẩm thường → **"Thêm vào giỏ"**; sản phẩm tùy chỉnh → **"Bắt đầu thiết kế"** (→ module 12).
- `Unpublished` + khách có link → trang **"sản phẩm không còn khả dụng"** + gợi ý tương tự.

### 4.4 Module 14 — Cart & Checkout

- **Wizard** `<CheckoutStepper>`: Cart → Voucher → Ước tính ship/thuế → Thông tin & địa chỉ → Vận chuyển → Chốt tổng → Giữ hàng & chọn thanh toán.
- `<CartLineItem>`: ảnh + variant + **design thumbnail** (nếu tùy chỉnh) + `<QuantityStepper>` + line price + xoá.
- `<OrderTotals>` minh bạch: subtotal + ship + thuế − giảm giá = tổng.
- **Edge case UI:** dòng hết tồn → **chặn checkout**, cho giảm SL/xoá/đổi variant; giá đổi giữa giỏ↔checkout → xác nhận giá mới; voucher hết lượt → bỏ + tính lại.

### 4.5 Module 15 — Payment

- `<PaymentMethodSelector>`: radio-card có logo (gateway/ví/thẻ/chuyển khoản/COD/đặt cọc).
- **Chuyển khoản thủ công** → panel thông tin tài khoản + nội dung = mã đơn + **nút copy**, trạng thái `Awaiting Confirmation`.
- **Payment result:** success/fail + nút **"Thử lại"**.
- KHÔNG lưu dữ liệu thẻ (PCI-DSS) → chỉ hiển thị **4 số cuối + thương hiệu thẻ**.

### 4.6 Module 16 — Sales Chat

- `<ChatBubble>` 2 phía (khách trái / Sale phải), avatar, timestamp.
- **Rich bubble card** cho link sản phẩm/thiết kế/thanh toán/báo giá.
- **Internal note** (chỉ Sale thấy) → nền vàng nhạt + icon "internal", **không render phía khách**.
- **SLA indicator:** hội thoại quá hạn → badge đỏ/amber. Offline/ngoài giờ → thời gian phản hồi dự kiến + form thu email.
- Mobile: `<ChatComposer>` dạng bottom-sheet.

### 4.7 Module 17 (Order) & 18 (Customer)

- `<OrderTimeline>` + `<TrackingProgress>` (Shipped→In Transit→Delivered) cho khách.
- **Order amendment gating:** `Pending Payment`→sửa tự do; `Confirmed`/`In Production`(chưa in)→đổi địa chỉ/SL kèm thu thêm/hoàn bớt; `Packed`/`Shipped`→**disable sửa nội dung**, chỉ qua carrier/trả hàng. Nút "Huỷ" disable sau `Shipped`.
- Module 18: định danh (họ tên*, email* khoá định danh, SĐT*, cá nhân/doanh nghiệp → mã số thuế), **sổ địa chỉ VN 3 cấp tỉnh/huyện/xã** (`<AddressBook>`/`<AddressForm>` cascading), saved payment (brand+last4), security (đổi mật khẩu, 2FA, thu hồi phiên), consent marketing (toggle + mốc), dữ liệu phái sinh read-only (lịch sử đơn, tổng chi, loyalty tier, segment), privacy actions (xuất/sửa/xoá dữ liệu).

---

## 5. Đối tượng người dùng & permission ở storefront

- Người dùng chính của app này là **khách hàng (Customer)** — self-service, không cần role back-office.
- Một số màn hình có **góc nhìn nhân viên** (chat trả lời của `Sales Staff`, điều phối `Order Coordinator`) — dùng `lib/auth` (`can`, `<Can>`, `RoleSwitcher`) để gating phần internal (ví dụ internal note chỉ Sale thấy). KHÔNG render control/internal data cho phía khách.
- `lib/auth/roles.ts` hiện chưa có `"Customer"` trong `ROLES` (mảng đang là roles back-office). Khi cần role khách rõ ràng cho storefront → **bổ sung `"Customer"` vào Role Registry cùng lượt** (đồng bộ `docs/00-system-overview §2`), không hardcode chuỗi rời.

---

## 6. Bộ shared components dùng chung

Đặt trong `src/components/shared/` (dùng chung) và `src/components/storefront/` (chuyên biệt). **Bắt buộc dùng lại**, không viết lại ở từng màn hình.

### 6.1 `<StatusBadge>` — component QUAN TRỌNG NHẤT

Một component generic xử lý mọi trạng thái. Nhận `status` + `domain`, tự tra `lib/domain/status-map.ts` → semantic tone → màu.

```tsx
<StatusBadge domain="order" status="Pending Payment" />
<StatusBadge domain="payment" status="Awaiting Confirmation" />
<StatusBadge domain="design" status="Confirmed" withIcon />
```

**7 semantic tone:**

| Tone | Nhóm trạng thái điển hình (storefront) |
|------|-----------------------------------------|
| `positive` | Confirmed, Delivered, Paid, Completed, Accepted, Pass, In stock |
| `info` | In Transit, Shipped, In Progress, Published, Authorized, Pre-order |
| `warning` | Pending Payment, On Hold, Awaiting Confirmation, Low stock, Warning (preflight) |
| `danger` | Cancelled, Failed, Delivery Failed, Returned, Out of stock, Fail |
| `neutral` | Draft, Created, Pending, Guest |
| `muted` | Closed, Unpublished, Anonymized, Voided, Superseded |
| `special` | Refunded, Partially Refunded, In Production |

**Render:** pill `radius.full`, nền = tone@12%, chữ+icon = tone@100%, viền = tone@24%. Kèm **nhãn tiếng Việt + tiếng Anh gốc trong `title`/tooltip**.

> **Nguồn sự thật:** mọi cặp `(domain, status) → tone` trong `lib/domain/status-map.ts`. Thêm module mới chỉ sửa file này, KHÔNG sửa component.

### 6.2 Component storefront đã có / cần dùng lại

Trong `components/storefront/` (kebab-case file) — **đã dựng**, tái sử dụng, không viết trùng:

- Catalog/PDP: `product-card` · `product-grid` · `image-gallery` · `price-display` · `availability-badge` · `variant-selector` · `rating-stars` · `quantity-stepper`.
- Cart/Checkout: `cart-line-item` · `voucher-input` · `order-totals` · `checkout-stepper` · `address-form` · `shipping-method-selector` · `payment-method-selector`.
- Order/Tracking: `order-timeline` · `tracking-progress` · `order-card` · `address-book`.
- Chat: `chat-bubble` · `chat-composer`.
- Design (module 12): `design-canvas` · `canvas-toolbar` · `preflight-report`.
- Shell/theme: `storefront-shell` · `theme-toggle`.

Trong `components/shared/`: `PageHeader` · `PageContainer` · `SectionTitle`(nếu có) · `Card` · `FilterBar` · `SearchBar` · `EmptyState` · `Skeleton`/`PageSkeleton` · `Toast` · `ConfirmDialog` · `Alert` · `DataTable` (chỉ khi thật cần bảng, ví dụ lịch sử đơn) · `StatTile`/`ListStatsPanel`.

> Trước khi tạo component mới: **glob `components/storefront/` và `components/shared/`** xem đã có chưa. Nếu có → dùng lại/mở rộng, không tạo bản trùng tên khác kiểu.

---

## 7. Motion, ảnh, accessibility

- **Motion:** Framer Motion, 200–320ms, ease mượt; reveal sản phẩm, transition trang nhẹ. Bọc trong `prefers-reduced-motion` (đã có ở `globals.css`).
- **Ảnh:** `next/image` bắt buộc; `fill` + `sizes` đúng cho card/gallery; `object-cover`; placeholder blur cho PDP.
- **A11y:** target chạm ≥ 44px; `focus-visible` (đã set outline brand ở base layer); `aria-label` cho icon-only button (nút chat nổi đã có; giỏ hàng nằm ở header); contrast đạt; keyboard nav cho gallery/variant/stepper.

---

## 8. shadcn/ui — không sửa tay `components/ui/*`

- `components/ui/*` là primitive shadcn (bọc `radix-ui`). **KHÔNG sửa trực tiếp** để tùy biến nghiệp vụ — tùy biến qua props/variant hoặc wrapper trong `shared/`/`storefront/`.
- Repo dùng gói `radix-ui` hợp nhất (không phải nhiều `@radix-ui/react-*` lẻ) + `shadcn` CLI. Chỉ thêm primitive khi có nhu cầu thật.
- Import theo alias `@/components/ui/...`; `cn()` lấy từ `@/lib/cn` hoặc `@/lib/utils` (KHÔNG import gói `cn` ngoài).

---

_Cặp file: `FRONTEND-AI-RULES.md` (trông thế nào) + `PRODUCTION-FRONTEND-RULES.md` (code thế nào). Khi mâu thuẫn nghiệp vụ → `docs/` thắng; mâu thuẫn kỹ thuật → file production thắng. Cập nhật cả hai khi đổi token/component/kiến trúc._
