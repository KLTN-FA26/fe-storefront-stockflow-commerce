---
description: Sửa lỗi lint và typecheck, không lách bằng any hoặc eslint-disable
allowed-tools: Bash(pnpm run:*), Bash(pnpm exec:*), Bash(git diff:*), Bash(git status:*), Read, Edit, Grep, Glob
---

Sửa lỗi lint + typecheck trong `${1:-src}`.

## Quy trình

1. Chạy `pnpm run typecheck` và `pnpm run lint` để thấy lỗi thật.
2. Phân loại lỗi do thay đổi hiện tại hay lỗi có sẵn.
3. Sửa từng nhóm lỗi nhỏ.
4. Chạy lại sau mỗi nhóm khi cần.
5. Kết thúc bằng `pnpm run typecheck` và `pnpm run lint` pass.

## Cấm lách

- Không dùng `any`.
- Không thêm `eslint-disable` nếu chưa có lý do kỹ thuật rõ.
- Không dùng `@ts-ignore` hoặc `@ts-expect-error`.
- Không ép kiểu chỉ để dập compiler.
- Không refactor rộng ngoài phạm vi lỗi.

Nếu lỗi cần đổi kiến trúc mới sửa được, dừng lại và báo người dùng.
