---
description: Productionize một storefront module 12-18 theo rules hiện tại
argument-hint: <module> ví dụ product-design, catalog, cart, checkout, payment, chat, order, customer
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(pnpm run:*), Bash(pnpm exec:*), Bash(git diff:*), Bash(git status:*)
---

Productionize storefront module `$1` theo rules:

- `src/_design/PRODUCTION-FRONTEND-RULES.md`
- `src/_design/FRONTEND-AI-RULES.md`
- `.claude/rules/feature-architecture.md`
- `.claude/rules/api-conventions.md`
- `.claude/rules/mode-b-storefront.md`
- `.claude/rules/testing.md`

## Trước khi sửa

1. Xác định module:
   - `product-design` — module 12.
   - `catalog` — module 13.
   - `cart` / `checkout` — module 14.
   - `payment` — module 15.
   - `chat` — module 16.
   - `order` — module 17.
   - `customer` / `account` — module 18.
2. Đọc page/components hiện tại.
3. Chỉ refactor phần thuộc module đó.

## Target

- Page mỏng, compose component.
- Business logic trong feature folder khi module đã đủ production scope.
- Data qua API/query layer, không direct mock import.
- Forms qua RHF + zod.
- Filter/search/sort/page qua URL state.
- UI dùng shadcn primitives và `components/storefront/*`.
- Theme Ink + Blue, no raw hex, no raw px.
- Loading, error, empty states đầy đủ.

## Verify

Chạy:

```bash
pnpm run typecheck
```

```bash
pnpm run lint
```

```bash
pnpm run test
```

```bash
pnpm run build
```

Với UI visible, verify bằng browser preview nếu khả dụng.
