---
description: Chạy đủ quy trình verify và báo output thật
allowed-tools: Bash(pnpm run:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*)
---

Chạy quy trình verify bắt buộc. Không suy đoán pass.

## Chạy

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

Hoặc chạy gộp:

```bash
pnpm run validate
```

## Báo cáo

- Dán output thật hoặc tóm tắt chính xác từng lệnh.
- Nếu fail, phân biệt lỗi do thay đổi hiện tại với lỗi có sẵn.
- Lỗi do mình gây ra phải sửa trước khi báo xong.
- Không dùng `any`, `eslint-disable`, `@ts-ignore`, hoặc bỏ test để lách.
