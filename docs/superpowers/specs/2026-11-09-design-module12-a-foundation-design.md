# Module 12 — Part A: foundation and lifecycle per the 2026-11 docs

- Date: 2026-11-09
- Status: approved in brainstorming (sections 1–3), pending spec review
- Supersedes for lifecycle, data contract and workflow screens:
  `2026-10-25-design-studio-3d-design.md` and `2026-10-25-design-api-be-proposal.md`
  (their engine, rendering and editor chapters stay valid).
- Sources read: docs `D:\FPTU\docs\docs` @ `42d286d` — `ecommerce/12-product-design` (rewritten
  2026-11-05, projects 2026-11-06/07), `warehouse/01-product-creation` §4.10, `ecommerce/13-catalog`
  §4.4–§4.6, `open-questions` B6–B8, B18, B25, B34–B44. Storefront `dev` @ `556aa57`.

## 1. Intent

### What the user said

- The docs are the standard. The FE is simply coded first; the BE follows the same docs later.
- Build Module 12 in five parts, in order: **A** foundation and lifecycle, **B** print configuration
  (dieline file, GLB model), **C** export bundle (PDF/X-4 …), **D** after approval (customer SKU,
  quote request), **E** design projects. This spec covers **A** only.

### Decisions taken in brainstorming

| Topic                                                      | Decision                                                                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How A changes the code                                     | Rework in place inside `features/product-design`; keep the engine; replace the data layer, lifecycle and workflow screens; delete the old-workflow code |
| `USE_MOCK=false` while the BE lacks the docs' API          | The design module **always runs on the mock**; catalog, orders etc. keep calling the real BE. One switch, removed when the BE ships                     |
| Brush, eraser, background colour/pattern (not in the docs) | **Keep**, recorded as a proposed docs extension (§10)                                                                                                   |
| Who renders the print bundle                               | **The browser, when the customer submits**; the system freezes that bundle on approval (§6, docs deviation recorded in §10)                             |
| Shared text in projects                                    | **Not built** (docs only share images/logos)                                                                                                            |
| Mock persistence                                           | The design mock store persists to **IndexedDB** (falls back to memory)                                                                                  |
| Reviewer actions on the mock                               | A **simulation panel**, shown only while design runs on the mock                                                                                        |

### Success

A customer can, on the mock, with the same screens whatever `USE_MOCK` says: start a design from a
variant that has a print configuration, design, save, submit (preflight pass/fail), see it returned
with a reason, fix and resubmit, see it approved, create a revision, and delete a draft — exactly
as docs 12 §4.1–§4.7 and §5.1 describe, surviving page reloads.

### Out of scope for A

- B: dieline files, GLB models, "no model → 2D only", SVG/PDF uploads.
- C: PDF/X-4, `PRODUCTION_INSTRUCTION`, the 3D preview image, checksum verification on download.
- D: customer SKU display, quote request, "Gửi duyệt và yêu cầu báo giá".
- E: design projects, asset library, batch review, project quote request.
- Back-office screens (Sales Manager review, print configuration upload) and the real BE.

A leaves room for B–E: a design carries `projectId` (always `null` in A), assets are stored per
design (docs BR-18 copies library files into a design), and the submit pipeline is a function that
renders one design without the studio open, so E's batch submit can call it per design.

## 2. Docs rules A implements

| Docs                   | Rule                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12 §4.1, BR-01, BR-02  | A design belongs to one customer, one `CUSTOMIZABLE` product and one variant; starting needs an `Active` variant of a usable product **with a print configuration** (dieline + print area) |
| 12 §4.1, B37           | At most **50 `DRAFT`** designs per customer (`ARCHIVED` and others not counted)                                                                                                            |
| 12 §3                  | Name 1–200 characters, set by the customer, editable while `DRAFT`                                                                                                                         |
| 12 §4.2 step 7, BR-11  | Every save bumps the design's `version`; every write sends the version the user is looking at; a stale one is refused                                                                      |
| 12 §4.2 step 9, BR-16  | Only a `DRAFT` can be deleted → `ARCHIVED`; never restored                                                                                                                                 |
| 12 §4.3, BR-05, B18    | Submitting runs preflight: **Pass / Fail only** (no warning level); Fail lists each failing element; the design stays `DRAFT`                                                              |
| 12 §4.3 step 12, BR-07 | Pass → `PENDING_REVIEW`; the design is locked (no files, no layout change, no delete)                                                                                                      |
| 12 §4.4, BR-06         | Sales Manager: Approve, or Return with a reason (1–2,000 characters, required) → `DRAFT`                                                                                                   |
| 12 §4.5, BR-08, BR-09  | Approve freezes the bundle and content into an immutable snapshot (checksums) and creates the customer SKU; `APPROVED` is final and read-only                                              |
| 12 §4.7, BR-12         | "Tạo bản sửa" on an `APPROVED` design creates a new `DRAFT` copying the snapshot's content, recording the source snapshot                                                                  |
| 12 BR-03, B38          | A customer sees only their own designs; others answer as not found. Staff never see drafts                                                                                                 |
| 12 BR-04               | Uploads are checked against the variant's file rules (format, size) and rejected without storing                                                                                           |
| 13 BR-14               | The "Thiết kế" button shows only on an `Active` variant of a `Published` product that has a print configuration                                                                            |

## 3. Lifecycle

### 3.1 States (replaces the six derived UI states of `lifecycle.ts`)

| Status           | Label (`DesignStatusBadge`; the repo has no shared `StatusBadge`) | Tone       | Studio    | Customer actions                             |
| ---------------- | ----------------------------------------------------------------- | ---------- | --------- | -------------------------------------------- |
| `DRAFT`          | "Bản nháp"                                                        | `neutral`  | Editable  | `edit`, `rename`, `save`, `submit`, `delete` |
| `PENDING_REVIEW` | "Chờ duyệt"                                                       | `info`     | Read-only | —                                            |
| `APPROVED`       | "Đã duyệt"                                                        | `positive` | Read-only | `createRevision` (D adds `requestQuote`)     |
| `ARCHIVED`       | — (never listed)                                                  | `muted`    | Not found | —                                            |

A `DRAFT` with a latest return shows "Bị trả lại" as a secondary badge (tone `warning`) and the reason.

### 3.2 Transitions

| From             | To               | Trigger                                                          | By                                           |
| ---------------- | ---------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| —                | `DRAFT`          | create from a variant; create revision from an `APPROVED` design | Customer                                     |
| `DRAFT`          | `DRAFT`          | save (version + 1)                                               | Customer                                     |
| `DRAFT`          | `PENDING_REVIEW` | submit, preflight Pass                                           | Customer, system                             |
| `DRAFT`          | `ARCHIVED`       | delete                                                           | Customer                                     |
| `PENDING_REVIEW` | `APPROVED`       | approve                                                          | Sales Manager (simulation panel on the mock) |
| `PENDING_REVIEW` | `DRAFT`          | return with reason                                               | Sales Manager (simulation panel on the mock) |

`APPROVED` and `ARCHIVED` are terminal. `lifecycle.ts` owns the table, `TERMINAL_STATUSES` and
`allowedActions(design)`; JSX renders action descriptors only.

### 3.3 History events (docs 12 §5.3)

`CREATED`, `DERIVED_FROM_SNAPSHOT`, `PREFLIGHT_FAILED` (with issues), `SUBMITTED_FOR_REVIEW`,
`RETURNED` (with reason), `APPROVED` (with snapshot id, SKU code, bundle checksum), `ARCHIVED`.
D adds `QUOTE_REQUESTED`; E adds `ADDED_TO_PROJECT` / `REMOVED_FROM_PROJECT`.

## 4. Data contract

The FE defines this contract from the docs. The mock serves it now; the BE implements it later.
All responses use the existing `ApiResponse` envelope; errors use the existing `ApiError` shape.
Every write carries `version` and answers `409 VERSION_CONFLICT` when it is stale.

### 4.1 Types (zod in `schemas.ts`, `z.infer` in `types.ts`)

```ts
type DesignStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "ARCHIVED";

type DesignDto = {
  id: string; // uuid
  name: string; // 1..200
  status: DesignStatus;
  product: { slug: string; title: string };
  variant: { sku: string; label: string };
  version: number; // int >= 0
  projectId: string | null; // always null in A (part E)
  sourceSnapshotId: string | null;
  lastReturn: { reason: string; returnedAt: string } | null;
  previewUrl: string | null; // latest CUSTOMER_PREVIEW, for cards
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  approval: { snapshotId: string; skuCode: string; bundleChecksum: string } | null; // APPROVED only
};

type PrintConfigDto = {
  sku: string;
  product: { slug: string; title: string; status: "APPROVED" | "PUBLISHED" | string };
  variantStatus: "ACTIVE" | "BLOCKED" | "OBSOLETE";
  hasCartonSpec: boolean; // BR-05: required before submit
  template: CustomizationTemplate; // today's engine template: model + print areas (+ safe, bleed)
  fileRules: { minDpi: number; formats: string[]; maxFileSizeMb: number }; // B34 defaults 300 / PNG,JPG / 50
};

type DesignEventDto = {
  type:
    | "CREATED"
    | "DERIVED_FROM_SNAPSHOT"
    | "PREFLIGHT_FAILED"
    | "SUBMITTED_FOR_REVIEW"
    | "RETURNED"
    | "APPROVED"
    | "ARCHIVED";
  at: string;
  version: number;
  note: string | null;
};
```

Inputs: `CreateDesignInput { productSlug, sku, name }` (the server checks the SKU belongs to the
product), `RenameDesignInput { name, version }`,
`SaveDocumentInput { document, version }`, `SubmitDesignInput { version, preflight, files }`,
`DeleteDesignInput { version }`, `ReturnDesignInput { reason }` (simulation). Name and reason limits
are zod refinements citing docs 12 §3.

The design document keeps today's engine schema (`engine/document/schema.ts`): image, text and
drawing elements, plus the background (§10 records drawing and background as extensions).

### 4.2 Endpoints

| Method and path                                            | Purpose                                                                                                                                       | Errors                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /designs?status=&page=&size=`                         | The caller's designs, newest updated first; `ARCHIVED` never listed                                                                           | —                                                                              |
| `GET /designs/draft-count`                                 | `{ drafts, limit: 50 }`                                                                                                                       | —                                                                              |
| `POST /designs`                                            | Create a `DRAFT` from a variant (empty document of its template)                                                                              | `422 PRINT_CONFIG_MISSING`, `422 VARIANT_UNAVAILABLE`, `409 DRAFT_LIMIT`       |
| `GET /designs/{id}`                                        | One design                                                                                                                                    | `404` (not the caller's, or `ARCHIVED`)                                        |
| `PATCH /designs/{id}`                                      | Rename                                                                                                                                        | `409 INVALID_STATE` (not `DRAFT`)                                              |
| `GET /designs/{id}/history`                                | Events, oldest first                                                                                                                          | —                                                                              |
| `GET /designs/{id}/document`                               | `{ document, version }`                                                                                                                       | —                                                                              |
| `PUT /designs/{id}/document`                               | Save; returns the new version                                                                                                                 | `409 INVALID_STATE`, `409 VERSION_CONFLICT`                                    |
| `GET` / `POST /designs/{id}/assets`                        | List / upload an image (multipart)                                                                                                            | `422 FILE_REJECTED` (format, size, scan), `409 INVALID_STATE`                  |
| `GET /designs/{id}/assets/{assetId}/url`                   | Short-lived link                                                                                                                              | —                                                                              |
| `POST /designs/{id}/submissions`                           | Multipart: `version`, `preflight` (JSON), `PRINT_READY`, `CUSTOMER_PREVIEW`, `TECHNICAL_SPEC`; re-checks preflight items the server can check | `422 PREFLIGHT_FAILED { issues }`, `409 INVALID_STATE`, `409 VERSION_CONFLICT` |
| `DELETE /designs/{id}`                                     | Body `{ version }`; `DRAFT` → `ARCHIVED`                                                                                                      | `409 INVALID_STATE`, `409 VERSION_CONFLICT`                                    |
| `POST /designs/{id}/revisions`                             | New `DRAFT` from the `APPROVED` design's snapshot (content and images copied)                                                                 | `409 INVALID_STATE`, `409 DRAFT_LIMIT`                                         |
| `POST /designs/{id}/preflight-failures`                    | Body `{ version, issues }`; records `PREFLIGHT_FAILED` for a submit the browser's preflight refused; no state change                          | `409 INVALID_STATE`                                                            |
| `GET /designs/{id}/files`                                  | The bundle of the latest submission (role, name, size, sha256, url)                                                                           | —                                                                              |
| `GET /catalog/products/{slug}/variants/{sku}/print-config` | The variant's print configuration                                                                                                             | `404` (none)                                                                   |

Server-side preflight re-check on submit (mock now, BE later): the design is `DRAFT`, the version
matches, the variant is `ACTIVE`, the product is usable, `hasCartonSpec`, at least one element,
every referenced asset exists and passes the file rules, the three files are present and their
SHA-256 match what the client sent.

### 4.3 Mock-only routes (simulation panel)

`POST /__mock/designs/{id}/approve`, `POST /__mock/designs/{id}/return { reason }`,
`POST /__mock/reset`, `GET /__mock/storage` (ruling R15). They exist only in the mock route table;
nothing outside the simulation panel calls them.

### 4.4 Query keys and invalidation

`designKeys` factory: `all`, `lists()`, `list(params)`, `detail(id)`, `history(id)`, `document(id)`,
`assets(id)`, `files(id)`, `draftCount()`, and `printConfigKeys.detail(slug, sku)`.

| Mutation                  | Invalidates                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| create, create revision   | `lists()`, `draftCount()`                                           |
| rename                    | `detail(id)`, `lists()`                                             |
| save document             | `detail(id)` (version), `lists()` (updatedAt)                       |
| upload asset              | `assets(id)`                                                        |
| submit                    | `detail(id)`, `history(id)`, `files(id)`, `lists()`, `draftCount()` |
| delete                    | `lists()`, `draftCount()`; removes `detail(id)`                     |
| simulate approve / return | `detail(id)`, `history(id)`, `lists()`, `draftCount()`              |

### 4.5 Wire details

What the FE and the mock rely on beyond §4.1–§4.2 (ruling R19); the BE implements the same. Paths
are under `/api/v1`. Nullable fields are sent as `null`, never left out.

**Envelopes.** Success: `{ success: true, data, timestamp }`. Failure: `{ success: false, errorCode,
message, fieldErrors?: [{ field, message }], details?, correlationId, timestamp }`. The screens key
on `errorCode`, never on `message`.

**Order of checks on a write.** Not found (`404`, also for `ARCHIVED` and other customers'
designs) → malformed input (`422 VALIDATION_FAILED`) → `409 INVALID_STATE` → `409
VERSION_CONFLICT` → the write's own checks. `INVALID_STATE` comes before `VERSION_CONFLICT` so a
tab that missed a submit learns that the status changed, not only that its version is stale.

**Malformed input.** A missing or wrong field (`version` not a whole number ≥ 0, a blank or
over-long name or reason, a document that does not parse or is not for the design's template,
unreadable `preflight` or `issues`) answers `422 VALIDATION_FAILED` with one `fieldErrors` entry
naming the field. _Open alignment point:_ the BE's `ErrorCode.VALIDATION_FAILED` answers `400`
today; the FE reads the code, so either works, but the docs should pick one.

**Versions.** One `version` for the design and its document (docs 12 BR-11), `0` on a new design.

| Write                                                  | Version           |
| ------------------------------------------------------ | ----------------- |
| save document, rename, submit, delete, approve, return | + 1               |
| upload image, `preflight-failures`                     | unchanged         |
| create, revision                                       | new design at `0` |

**Document record** (`GET` / `PUT /designs/{id}/document`). `{ designId, version, document,
checksum, updatedAt }`. `PUT` takes `{ version, document }`, stores the document as sent and
answers the new record. `checksum` is the lower-case hex SHA-256 of the document's RFC 8785
canonical JSON (keys sorted by UTF-16 code units, no whitespace, ECMAScript number and string
forms), byte-identical to the browser's `documentChecksum` (`engine/export/checksum.ts`). The
browser depends on it: before submitting it re-reads the record and refuses to send unless the
stored checksum is the one of the document it drew (a mismatch means another tab saved; the
conflict dialog opens), and autosave adopts a newer version only while the checksum is unchanged.
A document over `1,000,000` bytes (UTF-8 of its JSON) answers `413 PAYLOAD_TOO_LARGE`; the browser
refuses it before sending too.

**Rename** (`PATCH /designs/{id}` `{ name, version }`). Name trimmed, 1–200 characters. Answers the
design with `version + 1`.

**List** (`GET /designs`). The page envelope `{ items, page, size, totalElements, totalPages,
hasNext, hasPrevious }` with a **0-based** `page` (the FE shows it 1-based); `size` 1–200, default
20; `status` one of §3.1. A bad `page`, `size` or `status` answers `400 UNSUPPORTED_PARAMETER`.

**Images.** `POST /designs/{id}/assets` is multipart with one `file` part and an `Idempotency-Key`
header (the browser's key is the SHA-256 hex of the bytes, name and type, so a true retry reuses
it). The same key with the same file answers the first upload again (`201`); the same key with
another file answers `422 IDEMPOTENCY_KEY_REUSED`. A type outside `fileRules.formats`, a size over
`fileRules.maxFileSizeMb` × 1,048,576 bytes, an unreadable image or no `file` part answer `422
FILE_REJECTED` and nothing is stored; a design not in `DRAFT` answers `409 INVALID_STATE`. The
asset DTO is `{ assetId, designId, originalName, contentType, widthPx, heightPx, sizeBytes,
checksum, storedAt }` (`checksum`: SHA-256 hex of the bytes); `GET …/assets` lists them newest
first. `GET …/assets/{assetId}/url` answers `{ url, expiresAt }` (ISO instant; the mock gives 5
minutes, the FE refreshes a link 30 s before it expires), `404` when the image or its bytes are
gone.

**File rules.** `PrintConfigDto.fileRules` is the source of truth (ruling R20): the studio's
template takes `minDpi`, `allowedFileFormats` (= `formats`, lower-case MIME types) and
`maxFileSizeMb` from it (`templateOf`), whatever the template itself says. A variant takes designs
when `variantStatus` is `ACTIVE` and `product.status` is `APPROVED` or `PUBLISHED`, upper case as
sent. `GET …/print-config` answers `404 NOT_FOUND` when the variant has none.

**Submission** (`POST /designs/{id}/submissions`, multipart). Parts: `version` (text);
`preflight` (JSON text `{ result: "Pass" | "Fail", issues }`); `checksums` (JSON text,
`{ CUSTOMER_PREVIEW, PRINT_READY, TECHNICAL_SPEC }` → lower-case SHA-256 hex of each file's bytes);
one file part per role, named by the role (`CUSTOMER_PREVIEW` `preview.png` `image/png`,
`PRINT_READY` `print-ready.pdf` and `TECHNICAL_SPEC` `technical-spec.pdf`, `application/pdf`).
After the checks above: a `Fail` preflight, or a failing server re-check (§4.2), answers `422
PREFLIGHT_FAILED` and is recorded as a `PREFLIGHT_FAILED` event; a missing part or a checksum that
does not match the bytes received answers `422 FILE_REJECTED`. Success answers the design
(`PENDING_REVIEW`, `version + 1`, `submittedAt`); its `previewUrl` is the new `CUSTOMER_PREVIEW`.
`GET /designs/{id}/files` then lists `[{ role, name, sizeBytes, sha256, url }]` in role order
(`[]` before a submission).

**`422 PREFLIGHT_FAILED`.** `details.issues` lists the issues in the engine's `PreflightIssue`
shape: `{ ruleId, level: "fail" | "note", message, surfaceCode?, elementId? }`, the last two left
out (not `null`) for an issue of the whole design. The FE reads any non-empty `ruleId`, so a rule
the server adds still shows its message.

**`POST /designs/{id}/preflight-failures`** `{ version, issues }` (at least one issue, each with a
`message`). Answers `201` with the event `{ type: "PREFLIGHT_FAILED", at, version, note }`, `note`
the issues' messages joined by `"; "`; the design is unchanged.

**`DELETE /designs/{id}`** `{ version }`. Answers `200` with the design, `status: "ARCHIVED"` and
`version + 1`; from then on it is not found, not listed and not counted.

**Create and revision** answer `201` with the new design (`version` `0`; a revision carries
`sourceSnapshotId` and the source's document and images). History events are
`{ type, at, version, note }`: `note` is the reason for `RETURNED`, the failed checks' messages for
`PREFLIGHT_FAILED`, the snapshot id for `DERIVED_FROM_SNAPSHOT`, `SKU … · snapshot … · checksum …`
for `APPROVED`, otherwise `null`.

**`/__mock/*`** (mock only). `approve` answers `200` with the design (`APPROVED`, `approval {
snapshotId, skuCode, bundleChecksum }`, `approvedAt`, `version + 1`), `409 INVALID_STATE` unless
`PENDING_REVIEW` with a complete bundle; `bundleChecksum` is the SHA-256 hex of the lines
`ROLE:sha256\n` in role order then `DESIGN_DOCUMENT:{document checksum}\n`. `return { reason }`
answers `200` with the design (`DRAFT`, `lastReturn`, `version + 1`), `422 VALIDATION_FAILED` for
a blank or over-2,000-character reason, `409 INVALID_STATE` unless `PENDING_REVIEW`. `reset`
answers `200` with `data: null`; `storage` answers `{ persistent }`. A mock that cannot answer
says `500 DESIGN_MOCK_FAILED`, one that never started `503 DESIGN_MOCK_UNAVAILABLE`.

## 5. Mock and switch

- **Switch.** `src/lib/config.ts` gains `DESIGN_API_MOCKED = true` (a constant, not an env var).
  `AppProviders` already calls `activateMockAdapter()` when `IS_MOCK`; otherwise, with
  `DESIGN_API_MOCKED`, it calls a new `activateDesignMockAdapter()` that registers only the design
  routes and sends a request to the mock when its path is a design path (`/designs…`,
  `/catalog/products/{slug}/variants/{sku}/print-config`, `/__mock/…`), every other request to
  axios' own adapter. Removing the constant hands design to the BE; no screen changes.
- **Store.** `mock-fixtures/designs.ts` is rewritten for this contract. It keeps the seeded designs
  idea (one design per status) and moves its state behind a `DesignMockStorage` interface with two
  implementations: `MemoryStorage` (tests, SSR, blocked IndexedDB) and `IndexedDbStorage` (designs,
  documents, history as JSON; assets and bundle files as Blobs). Writes are awaited before a
  response; `__mock/reset` clears it and reseeds.
- **Print configurations.** The mock owns a print configuration per known SKU (today's
  `design-templates.ts`, reshaped to `PrintConfigDto`). For a product it does not know — the real
  catalog's when `USE_MOCK=false` — it answers a default configuration by the product slug (slug
  contains "tui" or "bag" → the default kraft bag, otherwise the default PET cup) and uses the slug
  as the product title, flagged `ASSUMPTION (mock only)`. A SKU listed in the mock as "no print config" answers 404 so the
  no-button path is demoable.
- Only `mock-adapter.ts` imports mock modules, as today.
- **Secure context.** The design mock needs a secure context (`https://`, or `localhost`): it
  computes checksums with `crypto.subtle`, makes ids with `crypto.randomUUID`, and keeps two tabs
  from interleaving with Web Locks. Over plain `http` on a LAN address (a phone opening
  `http://192.168.x.x:3000`) all three are missing: design requests answer
  `500 DESIGN_MOCK_FAILED` while the rest of the app keeps working.
- **No random failures.** The design-only mock adds latency but never the full mock's random
  `500 MOCK_RANDOM_ERROR` (ruling R17): Module 12 ships on it, and its writes are not retried.

## 6. Screens

### 6.1 Product page entry (catalog §4.4, BR-14)

- `product-detail-screen.tsx` takes a `renderDesignEntry?: (sku) => ReactNode` prop; the product
  page passes the design feature's `<DesignEntry productSlug sku />`, so catalog never imports
  design.
- `<DesignEntry>` reads the print configuration of the selected variant: present and usable →
  button **"Thiết kế"** to `/design/new?product=…&sku=…` (today's `STORE_ROUTES.design.newFor`);
  absent → the line "Quy cách này chưa nhận thiết kế"
  with **"Chat với Sale"**.
- The catalog's "Liên hệ Sale báo giá" button (PR #31) becomes **"Chat với Sale"** (catalog BR-11: a
  variant is never quoted directly).

### 6.2 Launcher `/design/new?product=…&sku=…` (inside the desktop-only gate)

Checks in order, each failing one with its own state screen:

1. Signed in; else the sign-in prompt.
2. The desktop-only gate; phones and tablets see the notice and **no draft is created**.
3. The variant has a print configuration and is usable; else the reason and "Chat với Sale".
4. Fewer than 50 drafts; else "Bạn đã có 50 bản nháp" and a link to "Thiết kế của tôi".
5. `POST /designs` with the name "{product title} · {variant label}", cut to 200 characters; then
   replace the URL with `/design/{id}`.

`template-choice.tsx` goes: one variant has one configuration.

### 6.3 "Thiết kế của tôi" `/design` (mobile-first)

- Tabs in the URL (`nuqs`): Tất cả / Bản nháp / Chờ duyệt / Đã duyệt; changing tab resets the page.
- Header line "x/50 bản nháp"; button "Thiết kế mới" opens a dialog: product (search) then variant
  (only variants with a print configuration) → launcher. The product list comes from the catalog
  query, passed in by the page.
- Card: preview (or placeholder), name, product · variant, status badge, last saved
  (`Asia/Ho_Chi_Minh`), return reason excerpt for a returned draft. Actions from `allowedActions`:
  draft → "Tiếp tục thiết kế", "Xoá" (confirm dialog); pending → "Xem"; approved → "Xem",
  "Tạo bản sửa". On a phone, opening the studio shows the desktop-only notice as today.
- Empty: no designs → "Bạn chưa có thiết kế nào" + "Xem sản phẩm"; empty tab → "Xem tất cả".

### 6.4 Studio `/design/[id]`

- **`DRAFT`:** today's editor. Header: editable name, save state, **"Lưu"** (Ctrl+S) — autosave
  stays and each autosave is a save — and the primary **"Gửi duyệt"**. Preflight panel shows
  Pass/Fail and a separate "Lưu ý khi in" list (§7); clicking an issue selects its element. A returned
  draft shows a banner with the reason and when.
- **Submit:** run preflight → Fail: dialog listing issues, no bundle rendered, and the FE records the
  attempt with `POST preflight-failures` (docs §5.3 `PREFLIGHT_FAILED`). Pass: confirm dialog (preview, "Bản sẽ bị khoá
  đến khi có kết quả duyệt", the print-colour disclaimer) → save → render the bundle with a step
  indicator (preview, print file, spec, upload) → `POST submissions` → studio turns read-only. A
  server-side Fail (`422 PREFLIGHT_FAILED`) shows the same issue dialog.
- **`PENDING_REVIEW`:** read-only (tool rail hidden, 3D orbit and face switching kept), banner
  "Đang chờ Quản lý kinh doanh duyệt — gửi lúc …".
- **`APPROVED`:** read-only, banner "Đã duyệt lúc …", download of the customer preview, button
  **"Tạo bản sửa"** (creates the revision and opens it).
- **Not found / `ARCHIVED` / not the caller's:** the existing "Không tìm thấy thiết kế".
- The desktop-only gate is unchanged.

### 6.5 Simulation panel (mock only)

A floating button labelled "Giả lập Quản lý kinh doanh", rendered only when `DESIGN_API_MOCKED` or
`IS_MOCK`. On a `PENDING_REVIEW` design: **Duyệt** (the mock writes a fake SKU code
`{productCode}-KH{customerNo}-{seq}`, a snapshot id and the bundle checksum) and **Trả lại** with a
reason (1–2,000 characters). It also offers "Xoá dữ liệu mock" (`__mock/reset`) and says when the
store is memory-only.

## 7. Preflight (Pass / Fail)

The engine keeps its rules; the result becomes `PASS | FAIL`, and issues are `fail` (blocking) or
`note` (advice, never blocking, shown under "Lưu ý khi in").

| Rule (today)                                                       | Today          | A                                                             | Why                                           |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `EMPTY_DESIGN`                                                     | fail           | fail                                                          | Docs BR-05: at least one element              |
| `DPI_BELOW_MIN`                                                    | fail           | fail                                                          | Threshold `fileRules.minDpi` (default 300)    |
| `DPI_LOW` (below 300 when min is lower)                            | warning        | **removed**                                                   | No warning level (B18)                        |
| `OUTSIDE_PRINT_AREA`                                               | fail           | fail                                                          | Must stay inside print area + bleed           |
| `CROSSES_SAFE_AREA`                                                | warning        | **fail** for text and images                                  | Docs: text and logos inside the safe zone     |
| `ON_SEAM`                                                          | warning        | **fail** for text and images                                  | The seam strip is not printable content area  |
| `ASSET_INVALID`                                                    | fail           | fail                                                          | Format, size, missing file (BR-04)            |
| `FONT_NOT_ALLOWED`                                                 | fail           | fail **only when the font did not load**; the allow-list goes | Font rules are later scope (01 §4.10 step 6)  |
| `WHITE_ON_KRAFT`, `TOO_MANY_COLORS`, `TOO_THIN`, `CMYK_CONVERSION` | warning / info | **note**                                                      | Colour and print-method rules are later scope |
| new `VARIANT_UNAVAILABLE`                                          | —              | fail                                                          | Variant `ACTIVE`, product usable              |
| new `NO_CARTON_SPEC`                                               | —              | fail                                                          | B25, BR-05                                    |

Backgrounds (colour, pattern) and drawings are exempt from the safe-zone rule: they may run into
the bleed. A full-bleed **photo** is not supported in A (see §10).

The risk-acceptance checkbox and the Warning tier of `printDpi` disappear; the print raster stays at
`max(minDpi, 300)` DPI.

## 8. What is removed or replaced

- Removed: `capabilities.ts`; `workflow-view.tsx` and `workflow-context.tsx`; `finalize-dialog.tsx`,
  `use-finalize.ts`, `change-request-dialog.tsx`, `review-void-guard.tsx`, the confirmation,
  withdrawal, technical-review and specification calls in `api.ts` / `mutations.ts`;
  `template-choice.tsx`; `getCustomization(slug)`; `WORKFLOW_ONLY_HINTS`; the six UI states.
- Replaced: `lifecycle.ts` (§3), `schemas.ts` / `types.ts` (§4.1), `api.ts` / `queries.ts` /
  `mutations.ts` (§4.2, §4.4), `primary-action.tsx` (Gửi duyệt / Tạo bản sửa), `review-submit-dialog.tsx`
  and `use-review-submission.ts` (§6.4; the rendering part moves to a studio-free
  `buildSubmissionBundle(design, document, assets, config)`), `confirmed-card.tsx` (approved banner),
  `design-status-badge.tsx` (§3.1), `mock-design.ts` and `mock-fixtures/designs*.ts` (§5).
- Kept: the engine, editor tools, 2D stage, 3D viewer, autosave and offline draft (keys unchanged),
  conflict dialog, desktop-only gate, layout.

## 9. Errors

| Situation                                                                | Handling                                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Upload rejected (format, size, scan)                                     | Inline error with the reason; nothing stored                     |
| Offline while saving                                                     | Keep the local draft, banner, retry                              |
| `409 VERSION_CONFLICT`                                                   | Existing conflict dialog: reload the latest                      |
| `409 INVALID_STATE` (changed in another tab)                             | Refetch; the studio follows the new status (read-only)           |
| Preflight Fail (client or `422 PREFLIGHT_FAILED`)                        | Issue dialog; stays `DRAFT`                                      |
| Bundle render or upload fails mid-way                                    | Stays `DRAFT`; "Thử lại"; a partial bundle is never submitted    |
| `409 DRAFT_LIMIT`, `422 PRINT_CONFIG_MISSING`, `422 VARIANT_UNAVAILABLE` | Launcher state screens (§6.2)                                    |
| No WebGL                                                                 | Today's flat preview                                             |
| IndexedDB blocked                                                        | Memory storage; the simulation panel says data is lost on reload |
| zod parse failure                                                        | Treated as a contract bug: the route error screen, logged        |

## 10. Open questions for the docs owner

1. **Brush, eraser, background colour/pattern** are kept although docs 12 §3 lists only images and
   text. Proposal: add them to the layout definition and to `TECHNICAL_SPEC`.
2. **Bundle timing.** Docs 12 §4.5 / BR-09 export the files at approval. A renders them in the
   browser at submit and freezes them at approval, so the reviewer reviews the exact print file.
   Proposal: docs say "exported at submit, frozen at approval"; BR-09's "export fails → approval
   refused" becomes "bundle missing or checksum mismatch → approval refused".
3. **Full-bleed photos.** Docs require text and logos inside the safe zone but say nothing about a
   photo meant to bleed. A fails any image crossing the safe zone. Proposal: an image marked
   "Ảnh nền" may run to the bleed edge.
4. **Seam.** The cup's glue seam is not in the docs' print configuration; A treats it as outside
   the content area.

## 11. Rules and documents to update in the same work

- `.claude/rules/mode-b-storefront.md`, Module 12: replace "`Fail` blocks confirm", "`Warning`
  requires customer risk confirmation", "Add to cart is enabled only when Design status is
  `Confirmed`" and "Variant changes must trigger a recheck warning" with: preflight is Pass/Fail,
  Fail blocks submitting, a design is bound to one variant, only an `APPROVED` design can be quoted.
- `src/_design/FRONTEND-AI-RULES.md` lines 196–197 (and the `Warning preflight` / `Confirmed`
  mentions at 124, 257, 266): the same content. **Protected file — edited only with the user's
  explicit permission at that step.**
- `2026-10-25-design-studio-3d-design.md` and `2026-10-25-design-api-be-proposal.md`: a
  "Superseded by 2026-11-09-design-module12-a-foundation-design.md for …" note at the top.

## 12. Testing

- **Unit:** the transition table (each allowed and refused move, both terminal states);
  `allowedActions` per status; every preflight rule of §7 at its threshold (DPI exactly `minDpi`,
  one millimetre over the safe line, backgrounds exempt, notes never blocking); zod limits (name
  200/201, reason 2000/2001, empty).
- **Mock contract:** version conflict on every write; state guards (delete, submit, rename only from
  `DRAFT`; revision only from `APPROVED`); the 50-draft limit on create and revision; file rules on
  upload; server re-check on submit (checksum mismatch, missing carton spec); simulation approve and
  return; persistence through `DesignMockStorage` with the memory implementation; `__mock/reset`.
- **Components (RTL):** list tabs and cards per status, delete confirm; launcher states in order;
  studio per status (tools hidden when read-only, banners); submit dialog for Pass and Fail and a
  failed upload; `<DesignEntry>` with and without a print configuration.
- **Gate:** the engine's existing tests stay green; `pnpm run validate`; in the browser preview the
  whole flow with `USE_MOCK=false`: design → submit → return → fix → resubmit → approve → revision →
  delete a draft, with a page reload between steps.
