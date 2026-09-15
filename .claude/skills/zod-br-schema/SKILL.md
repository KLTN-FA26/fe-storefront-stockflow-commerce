---
name: zod-br-schema
description: Use when writing zod schemas or lifecycle transition tables for storefront modules with BR-xx rules.
---

# Zod schema and traceable business rules

Business rules from docs must be encoded in schemas or lifecycle tables with traceable comments.

## Two schema layers

| Layer | Name                           | Purpose               | BR refine               |
| ----- | ------------------------------ | --------------------- | ----------------------- |
| DTO   | `XDto`                         | API response shape    | No, validate shape only |
| Input | `XCreateInput`, `XUpdateInput` | form/mutation payload | Yes                     |

`types.ts` should export `z.infer` from schemas instead of duplicating interfaces.

## Cite docs

Every refine or lifecycle business rule needs a short source comment:

```ts
// BR-05 (docs module 14 §4): checkout is blocked when a cart line is unavailable.
.refine((cart) => cart.lines.every((line) => line.available), {
  message: "Có sản phẩm không khả dụng trong giỏ hàng",
})
```

If docs are unclear, mark it explicitly:

```ts
// ASSUMPTION (open-question Q3): docs do not define partial deposit rounding yet.
```

## Lifecycle table

Keep status strings exact:

```ts
export const ORDER_TRANSITIONS = {
  "Pending Payment": ["Confirmed", "Cancelled"],
  Confirmed: ["In Production", "Cancelled"],
  Shipped: ["Delivered"],
  Delivered: [],
} as const satisfies Record<string, readonly string[]>;
```

Terminal states must be `[]`, and UI must not render mutating actions for terminal states.

## Tests

- Each transition table needs tests for allowed transitions and terminal states.
- Each BR refine needs a test proving invalid input fails.
- Action-gating should cover important roles/states.
- Use real visible behavior in component tests.

## Checklist

- DTO and Input schemas are separate.
- Types derive from zod.
- API parses data at the boundary.
- Every BR comment cites docs or an explicit assumption.
- Status strings match docs/backend exactly.
- Terminal states have empty transitions and tests.
