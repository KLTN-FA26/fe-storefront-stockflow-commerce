---
description: Audit design system storefront — token, shadcn, responsive, dark mode, raw controls
argument-hint: [path hoặc feature, mặc định src]
allowed-tools: Grep, Glob, Read, Bash(git diff:*), Bash(git status:*)
---

Audit `${1:-src}` read-only. Không tự sửa trong command này.

Đối chiếu:

- `src/_design/FRONTEND-AI-RULES.md`
- `.claude/rules/design-tokens.md`
- `.claude/rules/mode-b-storefront.md`
- `.claude/rules/shared-components.md`

## Tìm vi phạm

1. Hex trần trong `src/app`, `src/components`, `src/features`.
2. Theme sai: caramel/back-office/admin token trong storefront hoặc màu ngoài Ink + Blue token.
3. `pink`, `magenta`, `fuchsia`, `#FF00FF`.
4. `!important`.
5. Raw interactive controls khi đã có shadcn primitive phù hợp.
6. Card storefront quá sơ sài: thiếu ảnh, giá, CTA, availability, empty/loading/error state.
7. Touch target dưới 44px.
8. Số tiền/tổng tiền/quantity thiếu `tabular-nums`.
9. Status tự tô màu thay vì dùng `StatusBadge` khi applicable.
10. Dark mode bị hardcode màu sáng.

## Báo cáo

Mỗi finding dạng:

`file.tsx:42 — vấn đề — token/component đúng phải dùng`

Xếp mức nặng: sai theme > hex/raw màu > raw controls > responsive/a11y > density/typography.

Nếu sạch, nói rõ đã quét gì và không thấy vi phạm.
