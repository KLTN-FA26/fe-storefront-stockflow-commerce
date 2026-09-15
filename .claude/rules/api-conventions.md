---
description: axios client, query keys, invalidation, zod parse at boundaries, mock adapter
globs:
  - "src/lib/api/**"
  - "src/features/**/{api,queries,mutations,schemas}.ts"
  - "src/lib/validation/**"
---

# Data layer conventions

Source: `src/_design/PRODUCTION-FRONTEND-RULES.md` §2–§4.

## API client

Use a single API client in `src/lib/api/client.ts`. Client code must not call axios directly from pages or components; route all feature requests through `features/<module>/api.ts`.

`next.config.ts` rewrites `/api/:path*` to `process.env.API_URL`, so browser code should call project-relative `/api` endpoints where possible.

## Mock adapter

When `USE_MOCK=true`, requests go through `src/lib/api/mock-adapter.ts`.

`src/lib/api/mock-adapter.ts` is the only file allowed to import `src/lib/mock-data.ts`. New mocked endpoint → add a route in the adapter; do not let page/component code touch mock data.

## Query convention

Use query key factories per feature, not ad-hoc string keys:

```ts
export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (params: ProductListParams) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
};
```

## Mutation + invalidation

Every mutation declares what it invalidates. Examples:

- design confirm → invalidate design detail/list and any cart eligibility query.
- add to cart → invalidate cart lines and cart totals.
- checkout address/shipping/payment update → invalidate checkout quote/totals.
- order amendment → invalidate order detail, order list, customer order summary.

## Zod schema layers

| Layer | Name | Purpose |
| --- | --- | --- |
| DTO | `XDto` | backend/API response shape |
| Input | `XCreateInput`, `XUpdateInput` | form or mutation payload, including BR refine rules |

`types.ts` should export `z.infer` from schemas instead of handwritten duplicate interfaces.

## Parse at the boundary

Parse response data once in the API layer. React Query should receive validated typed data. Do not parse repeatedly inside components.

## BR traceability

Every `BR-xx` encoded in zod refine or lifecycle transition must cite the source docs in a short comment. If docs are not final, mark the assumption explicitly with `ASSUMPTION (open-question Xn)`.

## Forms

- Use react-hook-form + `zodResolver` for production forms.
- Use Input schemas for form payloads.
- Use `useFieldArray` for dynamic lists.
- Validate multi-step checkout/design wizards step by step.
- Map server field errors from the API error shape back to form fields.

## UI states

Every feature route should account for:

- initial loading with skeleton matching layout shape.
- background refetch without blocking the page.
- empty because no data exists.
- empty because filters/search exclude all results.
- 4xx error with actionable message.
- 5xx/network error with retry.
- zod parse failure as contract bug.
- pending mutation with disabled controls.
- offline banner when applicable.

## Formatting and performance

- Money/date/number formatting belongs in `src/lib/format/*`.
- Use timezone `Asia/Ho_Chi_Minh` for Vietnamese date display.
- Use `tabular-nums` for money, quantities, and aligned numeric values.
- Keep product imagery optimized with `next/image` and useful `sizes`.
- Debounce search around 300ms and abort stale requests where supported.
