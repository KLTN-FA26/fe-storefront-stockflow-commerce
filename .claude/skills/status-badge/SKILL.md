---
name: status-badge
description: Use when adding or reviewing a lifecycle/status badge in StockFlow Storefront.
---

# StatusBadge and status mapping

Use a single status badge path for lifecycle/status UI whenever the project has the needed domain/status support.

## Rule

Add a new status by updating the canonical status map, not by painting a one-off badge in JSX.

## Expected usage

```tsx
<StatusBadge domain="order" status="Pending Payment" />
<StatusBadge domain="design" status="Confirmed" size="sm" />
<StatusBadge domain="inventory" status="Out of stock" withIcon />
```

## Tone priority

When a status seems to match several tones, apply:

```txt
special > danger > positive > warning > info > muted > neutral
```

| Tone       | Meaning                                             |
| ---------- | --------------------------------------------------- |
| `special`  | production, refund, exceptional business state      |
| `danger`   | error, cancelled, failed, out of stock              |
| `positive` | confirmed, approved, completed, delivered, in stock |
| `warning`  | needs attention, pending approval, low stock        |
| `info`     | in progress, in transit, shipped                    |
| `muted`    | closed, inactive, archived                          |
| `neutral`  | draft, created, pending                             |

## Rules

- Keep raw backend/docs status strings unchanged in code.
- Put Vietnamese display labels in the label map when one exists.
- Do not create module-specific badge components for one status.
- Do not use `bg-green-*`, `text-red-*`, etc. for statuses.
- If the status map does not yet cover a storefront module, add the module/status support there first.
