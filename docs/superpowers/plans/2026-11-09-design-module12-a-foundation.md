# Module 12 part A — foundation and lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the storefront design feature from the old Sales-led workflow to the 2026-11 docs
lifecycle (`DRAFT / PENDING_REVIEW / APPROVED / ARCHIVED`, Pass/Fail preflight, customer submit,
reviewer approve/return, revisions, delete), on a contract the design mock serves whatever
`USE_MOCK` says.

**Architecture:** Rework in place inside `src/features/product-design`. The engine (geometry,
compositor, export, three.js viewer) stays; its preflight becomes Pass/Fail. The data layer,
lifecycle, list, launcher and studio workflow UI are replaced; the old workflow code is deleted.
The design mock is rewritten for the new contract, persists to IndexedDB, and is switched on for
design paths even when the rest of the app calls the real BE.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, TanStack Query 5, zod 4, nuqs,
axios (custom mock adapter), Vitest + RTL (jsdom), shadcn/Radix, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-11-09-design-module12-a-foundation-design.md` (read it
first; § numbers below refer to it).

## Global Constraints

- pnpm only. Never read or edit `.env` / `.env.*`.
- Only `src/lib/api/mock-adapter.ts` (and the mock route modules it loads) may import mock modules;
  only `mock-adapter.ts` may import `src/lib/mock-data.ts`.
- No raw hex colours or raw px in `src/app`, `src/components`, `src/features`; tokens only.
  `components/ui/*` is not edited.
- Server data in React Query with the `designKeys` factory; tab and page in the URL via `nuqs`;
  forms with react-hook-form + zod where a form exists; parse responses once in `api.ts`.
- Every `BR-xx` encoded in zod or `lifecycle.ts` cites the docs in a short comment
  (`// docs 12 BR-11`).
- UI copy is Vietnamese and exactly as written in the spec or this plan.
- Dates display in `Asia/Ho_Chi_Minh` through `src/lib/format`; numbers and counters use
  `tabular-nums`.
- Limits: name 1–200 characters (trimmed); return reason 1–2,000 characters; 50 `DRAFT` designs per
  customer; default file rules `minDpi 300`, formats PNG/JPG, `maxFileSizeMb 50`.
- The studio stays desktop-only (`DesktopOnlyGate`, unchanged); `/design` stays mobile-first.
- Commits: one per task, conventional prefix, **no `Co-Authored-By` or tool trailer**.
- Do not edit `src/_design/*RULES.md` except in Task 12, and only after the user says yes in chat.
- **Switch window:** Tasks 5–10 replace the data layer under components that still use the old one,
  so `pnpm run typecheck` fails between them. Each task must leave **its own files** error-free:
  `pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "<the task's files>"` prints nothing.
  Task 10 ends with the whole `pnpm run validate` green; Tasks 1–4 and 11–12 keep it green too.

## Review Focus

1. **Autosave racing submit** — the customer edits while the bundle renders, or an autosave is
   pending when "Gửi duyệt" is pressed: the submission must carry the version and document it
   rendered; a document changed in between is refused, never submitted half-new (Task 6 test).
2. **React StrictMode double effects in the launcher** — the create call runs once per visit, never
   two drafts for one click (Task 8 test).
3. **Two tabs** — tab A submits or deletes while tab B is editing: B's next save gets
   `409 INVALID_STATE`, B refetches and turns read-only, no data loss beyond B's unsaved edit, which
   the offline draft keeps (Task 9 test).
4. **Reload with IndexedDB** — designs, documents, uploaded images and bundle files survive a reload;
   a stored asset whose blob is missing reads as `ASSET_INVALID`, not a crash (Tasks 2 and 3 tests).
5. **Revision of an approved design** — the new draft's image elements resolve to copied assets, and
   the revision counts toward the 50-draft limit (Task 3 test).

---

## File map

| Area | Files |
| --- | --- |
| Engine preflight | `src/features/product-design/engine/preflight/{types,run}.ts`, `rules/{area,content,color,resolution}.ts`, new `rules/variant.ts`, `engine/index.ts` |
| Mock | `src/lib/api/mock-fixtures/{design-storage,design-print-configs,design-store,design-seed}.ts` (new or rewritten), delete `designs.ts`, `design-model.ts`, `design-uploads.ts`, `design-templates.ts`; `src/lib/api/mock-design.ts`; `src/lib/api/mock-adapter.ts`; `src/lib/api/mock-routes.ts`; `src/lib/config.ts`; `src/providers/app-providers.tsx` |
| Feature data | `src/features/product-design/{schemas,types,api,queries,mutations,lifecycle,selectors,errors,index}.ts`, new `simulation.ts`; delete `capabilities.ts` |
| Submit pipeline | new `components/studio/submission-bundle.ts`, new `components/studio/use-design-submission.ts`; delete `use-review-submission.ts`, `review-steps.tsx` (reworked into `submit-dialog.tsx`) |
| List, launcher, entry | `components/{design-list-screen,design-card,design-list-states,design-status-badge,new-design-screen,launcher-states}.tsx`, new `components/{new-design-dialog,design-entry,delete-design-dialog}.tsx`; delete `template-choice.tsx`; `src/features/catalog/components/{product-detail-screen,product-purchase-panel}.tsx`; `src/app/(storefront)/catalog/products/[slug]/page.tsx`; `src/app/(storefront)/design/page.tsx`; `src/app/(studio)/design/new/page.tsx` |
| Studio | `components/studio/{design-studio,studio-workspace,studio-context,studio-header,primary-action,status-strip,read-only-banner,decision-history,preflight-panel,design-name-field}.tsx`, new `components/studio/{submit-dialog,status-banner}.tsx`; delete `workflow-view.tsx`, `workflow-context.tsx`, `workflow-card.tsx`, `finalize-dialog.tsx`, `use-finalize.ts`, `change-request-dialog.tsx`, `review-void-guard.tsx`, `confirmed-card.tsx`, `review-submit-dialog.tsx` |
| Simulation | new `components/mock-review-panel.tsx`; mounted from `src/app/(studio)/layout.tsx` and `src/app/(storefront)/design/page.tsx` |
| Rules, docs | `.claude/rules/mode-b-storefront.md`, `src/_design/FRONTEND-AI-RULES.md` (with permission), `docs/superpowers/specs/2026-10-25-*.md` |

---

### Task 1: Preflight becomes Pass/Fail

**Files:**
- Modify: `src/features/product-design/engine/preflight/types.ts`, `run.ts`, `rules/area.ts`,
  `rules/content.ts`, `rules/color.ts`, `rules/resolution.ts`, `engine/index.ts`
- Create: `src/features/product-design/engine/preflight/rules/variant.ts`
- Modify (consumers): `components/studio/use-preflight.ts`, `preflight-panel.tsx`, `dpi-badge.tsx`,
  `finalize-dialog.tsx` (compile fix only; deleted in Task 9)
- Test: `src/features/product-design/engine/__tests__/preflight.test.ts`,
  `src/features/product-design/__tests__/use-preflight.test.tsx`

**Interfaces:**
- Produces:
  - `type PreflightLevel = "fail" | "note"`
  - `type PreflightReport = { result: "Pass" | "Fail"; issues: PreflightIssue[] }`
  - `type PreflightVariant = { usable: boolean; hasCartonSpec: boolean }`;
    `PreflightInput` gains `variant: PreflightVariant`
  - `PreflightRuleId` loses `DPI_LOW`, gains `VARIANT_UNAVAILABLE`, `NO_CARTON_SPEC`
  - `dpiTier(dpi: number, minDpi: number): "below-min" | "ok"`; `printDpi` and `PRINT_DPI_FLOOR`
    unchanged
  - `const VARIANT_OK: PreflightVariant = { usable: true, hasCartonSpec: true }` exported from
    `engine/index.ts` (the studio passes it until Task 9 wires the print configuration)

- [ ] **Step 1: Write the failing tests** in `engine/__tests__/preflight.test.ts` (rewrite the
  level expectations of the existing cases):
  - `result is Fail when any issue is fail, else Pass — notes never change Pass`
  - `DPI exactly minDpi passes; minDpi - 1 fails with DPI_BELOW_MIN; no DPI_LOW exists`
  - `text 1 mm past the safe line fails CROSSES_SAFE_AREA; image the same; background colour and pattern never do; a drawing never does`
  - `text on the cup seam fails ON_SEAM; a drawing on the seam does not`
  - `element past print area + bleed fails OUTSIDE_PRINT_AREA; one inside the bleed only (text) fails CROSSES_SAFE_AREA, not OUTSIDE`
  - `WHITE_ON_KRAFT, TOO_MANY_COLORS, TOO_THIN, CMYK_CONVERSION are level "note"`
  - `FONT_NOT_ALLOWED fails only when fontStatus is "error"; a font outside allowedFontCodes passes`
  - `variant { usable: false } adds VARIANT_UNAVAILABLE fail; { hasCartonSpec: false } adds NO_CARTON_SPEC fail; both carry no elementId`
  - `EMPTY_DESIGN still fails an empty document`
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/preflight.test.ts`
  — Expected: FAIL (levels, missing rules).
- [ ] **Step 3: Implement.** Change the levels as listed in spec §7; add `rules/variant.ts`
  (`variantIssues(variant: PreflightVariant): PreflightIssue[]`, messages
  "Quy cách này hiện không còn nhận thiết kế." and "Quy cách chưa có quy cách thùng, chưa gửi duyệt được."),
  call it from `runPreflight`; drop the `allowedFontCodes` and `DPI_LOW` branches; sort fails first.
  Update `use-preflight.ts` to pass `VARIANT_OK`; `preflight-panel.tsx` shows "Đạt" / "Không đạt"
  and lists notes under the heading "Lưu ý khi in"; `dpi-badge.tsx` shows two tiers;
  `finalize-dialog.tsx` drops its Warning branch.
- [ ] **Step 4: Run** the two test files and `pnpm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): preflight answers Pass or Fail, as the docs ask`

### Task 2: Mock storage that survives reloads

**Files:**
- Create: `src/lib/api/mock-fixtures/design-storage.ts`
- Test: `src/lib/api/mock-fixtures/design-storage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DesignMockSnapshot = { rows: Record<string, unknown>; }; // owned by Task 3's store
  export interface DesignMockStorage {
    readonly persistent: boolean;               // false for memory
    load(): Promise<DesignMockSnapshot | null>;
    save(snapshot: DesignMockSnapshot): Promise<void>;
    putBlob(key: string, blob: Blob): Promise<void>;
    getBlob(key: string): Promise<Blob | null>;
    clear(): Promise<void>;
  }
  export function createMemoryStorage(): DesignMockStorage;
  export function createIndexedDbStorage(dbName?: string): Promise<DesignMockStorage>; // rejects when IndexedDB is unavailable
  export function openDesignStorage(): Promise<DesignMockStorage>; // IndexedDB, else memory
  ```
  The IndexedDB database is `stockflow-design-mock`, stores `state` (one key `snapshot`) and `blobs`.

- [ ] **Step 1: Write the failing tests** (memory implementation; IndexedDB is checked in the
  browser in Task 12):
  - `load returns null before the first save, then the saved snapshot (deep copy, not the same object)`
  - `putBlob then getBlob returns a blob with the same bytes and type; unknown key → null`
  - `clear empties both the snapshot and the blobs`
  - `openDesignStorage falls back to memory when indexedDB is undefined (persistent === false)`
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/api/mock-fixtures/design-storage.test.ts` — FAIL.
- [ ] **Step 3: Implement** with `structuredClone` for snapshot copies; IndexedDB through the raw
  `indexedDB` API (no new dependency), one transaction per call.
- [ ] **Step 4: Run** the test and `pnpm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(design): a mock store that persists to IndexedDB`

### Task 3: The design mock serves the docs' contract

**Files:**
- Create: `src/lib/api/mock-fixtures/design-store.ts`, `design-print-configs.ts`
- Rewrite: `src/lib/api/mock-fixtures/design-seed.ts`, `src/lib/api/mock-design.ts`
- Delete: `src/lib/api/mock-fixtures/designs.ts`, `design-model.ts`, `design-uploads.ts`,
  `design-templates.ts` and their tests `designs.test.ts`
- Modify: `src/lib/api/mock-routes.ts` (registration), `src/lib/api/mock-fixtures/catalog.test.ts`
  (it imports `MOCK_DESIGN_TEMPLATES`: point it at `MOCK_PRINT_CONFIGS`)
- Test: `src/lib/api/mock-fixtures/design-store.test.ts`, `src/lib/api/mock-design.test.ts` (rewrite)

**Interfaces:**
- Consumes: Task 2 `DesignMockStorage`; engine `designDocumentSchema`, `customizationTemplateSchema`,
  `emptyDocument(template)` from `engine/document/factory.ts`.
- Produces:
  - `MOCK_PRINT_CONFIGS: Record<string /* sku */, PrintConfigRow>` built from today's templates
    (cup PET 500 ml, paper cups, kraft bag), plus `MOCK_SKU_WITHOUT_PRINT_CONFIG` (a seeded SKU that
    answers 404); `printConfigFor(slug: string, sku: string): PrintConfigRow | null` — unknown
    product: default by slug (`/tui|bag/` → bag, else PET cup), title = slug, flagged
    `// ASSUMPTION (mock only)`.
  - `createDesignMockStore(deps: { storage: DesignMockStorage; now?: () => Date; newId?: () => string; readImageSize?: (blob: Blob) => Promise<{ widthPx: number; heightPx: number }> }): Promise<DesignMockStore>`
    with methods returning `MockResult = { status: number; data: unknown }`:
    `list(q)`, `draftCount()`, `create(body)`, `get(id)`, `rename(id, body)`, `history(id)`,
    `getDocument(id)`, `putDocument(id, body)`, `listAssets(id)`, `uploadAsset(id, file, name, key)`,
    `assetLink(id, assetId)`, `submit(id, form: { version: number; preflight: unknown; files: Record<"PRINT_READY"|"CUSTOMER_PREVIEW"|"TECHNICAL_SPEC", Blob> })`,
    `recordPreflightFailure(id, body)`, `remove(id, body)`, `revise(id)`, `files(id)`,
    `printConfig(slug, sku)`, `simulateApprove(id)`, `simulateReturn(id, body)`, `reset()`.
  - `registerDesignMockRoutes(store: DesignMockStore): void` registering exactly the paths of spec
    §4.2 and §4.3 (`/catalog/products/:slug/variants/:sku/print-config`, `/__mock/designs/:id/approve`,
    `/__mock/designs/:id/return`, `/__mock/reset`).
  - Error bodies: the existing `ApiResponse` error envelope with codes `VERSION_CONFLICT`,
    `INVALID_STATE`, `DRAFT_LIMIT`, `PRINT_CONFIG_MISSING`, `VARIANT_UNAVAILABLE`, `FILE_REJECTED`,
    `PREFLIGHT_FAILED` (with `issues`), `NOT_FOUND`.
  - Seed: one design per status (`DRAFT`, `DRAFT` returned with a reason, `PENDING_REVIEW`,
    `APPROVED`, `ARCHIVED`), ids kept stable (`7d51f000-0000-4000-8000-00000000000N`).

- [ ] **Step 1: Write the failing store tests** (`design-store.test.ts`, memory storage, fixed `now`
  and `newId`):
  - `create needs a print config: unknown sku of a known product → 422 PRINT_CONFIG_MISSING; MOCK_SKU_WITHOUT_PRINT_CONFIG → 422; blocked variant → 422 VARIANT_UNAVAILABLE`
  - `create returns DRAFT version 0, projectId null, document = the template's empty document, history [CREATED]`
  - `the 51st DRAFT → 409 DRAFT_LIMIT; ARCHIVED and APPROVED do not count; revise also checks the limit`
  - `putDocument with a stale version → 409 VERSION_CONFLICT; on PENDING_REVIEW → 409 INVALID_STATE; ok → version + 1`
  - `rename trims, refuses empty and 201 characters (422), only on DRAFT`
  - `uploadAsset refuses a type outside fileRules.formats and a file over maxFileSizeMb (422 FILE_REJECTED), stores nothing`
  - `submit: stale version 409; missing file 422; preflight result Fail 422 PREFLIGHT_FAILED; hasCartonSpec false 422 PREFLIGHT_FAILED with NO_CARTON_SPEC; ok → PENDING_REVIEW, submittedAt set, history SUBMITTED_FOR_REVIEW, files(id) lists 3 roles with sha256`
  - `recordPreflightFailure appends PREFLIGHT_FAILED with the issues, status unchanged`
  - `history records RETURNED with the reason, APPROVED with snapshot id, SKU code and checksum, ARCHIVED, and DERIVED_FROM_SNAPSHOT on a revision, oldest first`
  - `remove: DRAFT → ARCHIVED (404 afterwards, not listed); PENDING_REVIEW → 409 INVALID_STATE`
  - `simulateReturn needs PENDING_REVIEW and a 1–2000 character reason; sets DRAFT and lastReturn`
  - `simulateApprove: PENDING_REVIEW → APPROVED with approval { snapshotId, skuCode, bundleChecksum }; skuCode matches /^[A-Z0-9-]+-KH\d+-\d{3}$/`
  - `revise from APPROVED → new DRAFT with sourceSnapshotId, same document, image elements pointing to copied assets that resolve; from DRAFT → 409`
  - `a store created again over the same storage sees the same designs, documents and asset blobs`
  - `an asset row whose blob is gone answers assetLink 404 and list keeps the row`
- [ ] **Step 2: Write the failing route tests** (`mock-design.test.ts`): each path of spec §4.2/§4.3
  reaches its store method (path params, multipart `file`, multipart submission parts, JSON
  bodies), and an unknown design id answers 404.
- [ ] **Step 3: Run** both — FAIL.
- [ ] **Step 4: Implement.** The store keeps rows in memory and writes the snapshot through
  `storage.save` after every write (awaited); blobs under keys `asset/{id}` and `file/{designId}/{role}`.
  `sha256` via Web Crypto. Register in `mock-routes.ts` with `await createDesignMockStore({ storage: await openDesignStorage() })`
  (routes registration becomes async; `registerAllMockRoutes` already runs inside the awaited
  `routesReady`). The 2 s QC timer goes.
- [ ] **Step 5: Run** both tests, `pnpm exec vitest run src/lib/api`, and `pnpm run typecheck` —
  PASS for `src/lib/api`; feature tests that call the old routes now fail (switch window opens at
  Task 5; this task's own files must be error-free).
- [ ] **Step 6: Commit** `feat(design): the design mock serves the docs' lifecycle`

### Task 4: Design always runs on the mock

**Files:**
- Modify: `src/lib/config.ts`, `src/lib/api/mock-adapter.ts`, `src/providers/app-providers.tsx`
- Test: `src/lib/api/mock-adapter.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `export const DESIGN_API_MOCKED = true;` in `src/lib/config.ts` with the comment
    "Module 12 runs on the mock until the BE serves the docs' design API (spec 2026-11-09 §5)."
  - `export function isDesignMockPath(url: string | undefined): boolean` — true for `/designs`,
    `/designs/…`, `/catalog/products/{slug}/variants/{sku}/print-config`, `/__mock/…` (query string
    ignored, leading `/api/v1` tolerated).
  - `export function activateDesignMockAdapter(): void` — registers only the design routes (dynamic
    import of `./mock-design` and the store, like `activateMockAdapter`) and sets the adapter to
    `(config) => isDesignMockPath(config.url) ? mockAdapter(config) : realAdapter(config)` where
    `realAdapter = axios.getAdapter(previousAdapter ?? axios.defaults.adapter)`.
  - `AppProviders`: `if (isMock) activateMockAdapter(); else if (DESIGN_API_MOCKED) activateDesignMockAdapter();` (browser only, as today).

- [ ] **Step 1: Write the failing tests:**
  - `isDesignMockPath`: true for `/designs`, `/designs/x/document`, `/catalog/products/ly-a/variants/SKU1/print-config`, `/__mock/reset`, `/api/v1/designs?page=0`; false for `/catalog/products/ly-a`, `/designs-old`, `/orders/me`
  - `activateDesignMockAdapter sends /designs to the mock and /catalog/products to the previous adapter` (spy adapter)
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/api/mock-adapter.test.ts` — FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the test and `pnpm run typecheck` for these files — PASS.
- [ ] **Step 5: Commit** `feat(design): the design module runs on its mock while the BE catches up`

### Task 5: The feature's data layer and lifecycle

**Files:**
- Rewrite: `src/features/product-design/{schemas,types,api,queries,mutations,lifecycle,selectors,errors,index}.ts`
- Delete: `src/features/product-design/capabilities.ts`, `__tests__/capabilities.test.ts`
- Test (rewrite): `__tests__/{schemas,lifecycle,selectors,errors,api,queries,mutations}.test.ts(x)`,
  `__tests__/design-backend.ts` (test helper over the new store), `__tests__/mock-contract.test.ts`,
  `__tests__/mock-design-routes.test.ts`

**Interfaces:**
- Consumes: Task 3 routes; Task 1 `PreflightReport`.
- Produces (names used by Tasks 6–11):
  - Schemas/types exactly as spec §4.1: `designStatusSchema` (`DRAFT|PENDING_REVIEW|APPROVED|ARCHIVED`),
    `designDtoSchema` → `Design`, `designPageDtoSchema` → `DesignPage` (1-based `page` in the app),
    `designEventDtoSchema` → `DesignEvent`, `printConfigDtoSchema` → `PrintConfig`,
    `designDocumentRecordDtoSchema` → `DesignDocumentRecord` (kept), `designAssetDtoSchema` →
    `DesignAsset` (kept), `designFileDtoSchema` → `DesignFile { role; name; sizeBytes; sha256; url }`,
    `draftCountDtoSchema` → `{ drafts: number; limit: number }`.
  - Inputs: `createDesignInputSchema { productSlug; sku; name }`, `renameDesignInputSchema { name }`,
    `returnReasonInputSchema { reason }` (1–2000, `// docs 12 BR-06`). Name rule `// docs 12 §3`.
  - `api.ts`: `listDesigns(p, signal)`, `getDraftCount(signal)`, `createDesign(input)`,
    `getDesign(id, signal)`, `renameDesign(id, { name, version })`, `getDesignHistory(id, signal)`,
    `getDesignDocument(id, signal)`, `saveDesignDocument(id, { version, document })`,
    `listDesignAssets(id, signal)`, `uploadDesignAsset(id, file, name, key)`,
    `getAssetDownloadUrl(id, assetId, signal)`, `submitDesign(id, { version, preflight, files })`,
    `recordPreflightFailure(id, { version, issues })`, `deleteDesign(id, { version })`,
    `createRevision(id)`, `listDesignFiles(id, signal)`,
    `getPrintConfig(productSlug, sku, signal)`.
  - `queries.ts`: `designKeys` per spec §4.4 plus `printConfigKeys.detail(slug, sku)`;
    `designQuery(id)` and `designDocumentQuery(id)` (`queryOptions`, for imperative fresh reads);
    `useDesignList(params)`, `useDraftCount()`, `useDesign(id)` (polls every 5 s while
    `PENDING_REVIEW`), `useDesignDocument(id, enabled)`, `useDesignAssets(id, enabled)`,
    `useDesignHistory(id)`, `useDesignFiles(id, enabled)`, `usePrintConfig(slug, sku, enabled)`,
    `useDownloadLink` (asset links only).
  - `mutations.ts`: `useCreateDesign()`, `useRenameDesign(id)`, `useSaveDesignDocument(id)`,
    `useUploadAsset(id)`, `useDeleteDesign()`, `useCreateRevision()`, `invalidateDesign(client, id)`;
    invalidation exactly as spec §4.4.
  - `lifecycle.ts`:
    ```ts
    export const DESIGN_TRANSITIONS: Record<DesignStatus, readonly DesignStatus[]>;
    export const TERMINAL_STATUSES: ReadonlySet<DesignStatus>; // APPROVED, ARCHIVED
    export type DesignAction = "edit" | "rename" | "save" | "submit" | "delete" | "createRevision";
    export function allowedActions(design: Pick<Design, "status">): readonly DesignAction[];
    export const DESIGN_STATUS_META: Record<DesignStatus, { label: string; tone: SemanticTone; editable: boolean; hint: string }>;
    export const isReturned: (design: Pick<Design, "status" | "lastReturn">) => boolean;
    ```
    Labels/tones from spec §3.1; hints: DRAFT "Thiết kế được lưu tự động. Khi xong, bấm Gửi duyệt.",
    PENDING_REVIEW "Quản lý kinh doanh đang duyệt thiết kế. Bạn sẽ nhận kết quả tại đây.",
    APPROVED "Thiết kế đã duyệt và không sửa được nữa. Muốn thay đổi, hãy tạo bản sửa.",
    ARCHIVED "Bản nháp đã xoá."
  - `selectors.ts`: `designCardView(design): { title; subtitle /* "{product} · {variant}" */; updatedLabel; status; returnReason: string | null; previewUrl }`,
    `defaultDesignName(productTitle: string, variantLabel: string): string` (≤ 200, cut from the
    product title), `eventView(event): { label; note; atLabel }` with Vietnamese labels for the seven
    events of spec §3.3.
  - `errors.ts`: messages for `VERSION_CONFLICT` "Thiết kế đã thay đổi, hãy tải lại.",
    `INVALID_STATE` "Thiết kế đã chuyển trạng thái, hãy tải lại.", `DRAFT_LIMIT`
    "Bạn đã có 50 bản nháp. Hãy xoá bớt trước khi tạo bản mới.", `PRINT_CONFIG_MISSING`
    "Quy cách này chưa nhận thiết kế.", `VARIANT_UNAVAILABLE` "Quy cách này hiện không còn nhận thiết kế.",
    `FILE_REJECTED` "Tệp không đúng định dạng hoặc vượt dung lượng cho phép.", `PREFLIGHT_FAILED`
    "Thiết kế chưa đạt kiểm tra tự động."; `isDesignConflict(error)` (VERSION_CONFLICT),
    `isDesignStateChanged(error)` (INVALID_STATE), `preflightIssuesOf(error): PreflightIssue[] | null`.

- [ ] **Step 1: Write the failing tests:**
  - `lifecycle.test.ts`: every pair (from, to) of the 4×4 matrix is allowed exactly as spec §3.2;
    `TERMINAL_STATUSES` has no outgoing transition; `allowedActions` per status equals spec §3.1;
    `isReturned` only for DRAFT with `lastReturn`.
  - `schemas.test.ts`: name `"  a  "` → `"a"`; `""` and 201 chars refused; 200 accepted; reason
    2000 ok / 2001 refused; `designDtoSchema` refuses an unknown status; `projectId` must be present
    (null allowed).
  - `selectors.test.ts`: `defaultDesignName` of a 250-character title is 200 characters and ends with
    the variant label; `designCardView` returns `returnReason` only for a returned draft.
  - `api.test.ts` (through the mock adapter, memory storage): each function parses its response and
    shifts pages to 1-based; `submitDesign` sends multipart with `version`, `preflight` and three
    named parts; `deleteDesign` sends `{ version }`.
  - `mutations.test.tsx`: each mutation invalidates the keys of spec §4.4 (spy on
    `invalidateQueries`).
  - `queries.test.tsx`: `useDesign` polls only while `PENDING_REVIEW`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/{lifecycle,schemas,selectors,errors,api,queries,mutations}*` — FAIL.
- [ ] **Step 3: Implement** the files above; remove every P1–P6 and `whenShipped` remnant.
- [ ] **Step 4: Run** the same tests — PASS; `tsc` clean for the files of this task.
- [ ] **Step 5: Commit** `feat(design): the data layer and lifecycle of the docs`

### Task 6: Submit pipeline outside the studio component

**Files:**
- Create: `components/studio/submission-bundle.ts`, `components/studio/use-design-submission.ts`
- Delete: `components/studio/use-review-submission.ts`
- Test: `__tests__/submission-bundle.test.ts`, `__tests__/use-design-submission.test.tsx`

**Interfaces:**
- Consumes: Task 1 `runPreflight`/`PreflightReport`; Task 5 `submitDesign`,
  `recordPreflightFailure`, `designQuery`, `designDocumentQuery`, `invalidateDesign`;
  `ExportRenderer` (unchanged); engine `buildPrintPdf`, `buildSheetPdf`, `buildSpecSummary`,
  `documentChecksum`, `mmToPx`, `printDpi`.
- Produces:
  ```ts
  export type BundleRole = "CUSTOMER_PREVIEW" | "PRINT_READY" | "TECHNICAL_SPEC";
  export type SubmissionBundle = Record<BundleRole, { name: string; type: string; bytes: Uint8Array }>;
  export type BundleStep = "preview" | "print" | "spec";
  export async function buildSubmissionBundle(input: {
    name: string; document: DesignDocument; template: CustomizationTemplate; surfaces: SurfaceSet;
    report: PreflightReport; checksum: string; renderer: ExportRenderer;
    onStep?: (step: BundleStep, fraction: number) => void;
  }): Promise<SubmissionBundle>;
  export type SubmitStep = "idle" | "checking" | BundleStep | "upload" | "done" | "error";
  export function useDesignSubmission(design: Design): {
    run(): Promise<void>; retry(): Promise<void>; step: SubmitStep; fraction: number;
    error?: unknown; issues: PreflightIssue[] | null; // set when preflight (client or server) failed
  };
  ```
  File names `preview.png`, `print-ready.pdf`, `technical-spec.pdf`; preview 1600 px; print raster
  `printDpi(template.minDpi)`.

- [ ] **Step 1: Write the failing tests:**
  - `buildSubmissionBundle` with a fake renderer: returns the three roles with the names and types
    above, calls `printSurface` once per surface in `surfaces.order` at `mmToPx(1, printDpi(minDpi))`,
    reports steps preview → print → spec in order, and calls `renderer.release()` even when
    `printSurface` throws.
  - `useDesignSubmission` (fake services):
    - preflight Fail → `issues` set, `recordPreflightFailure` called once with the version and issues,
      `submitDesign` not called, step `error`.
    - Pass → flushes autosave first, submits with the version read after the flush and the three
      files, then step `done` and the design cache holds `PENDING_REVIEW`.
    - **Review Focus 1:** the stored document checksum differs from the rendered one → nothing is
      submitted, autosave goes to conflict, step `error`.
    - server `422 PREFLIGHT_FAILED` → `issues` from the error, step `error`.
    - an upload failure then `retry()` reuses the rendered bundle (renderer not called again).
- [ ] **Step 2: Run** the two tests — FAIL.
- [ ] **Step 3: Implement**; the hook gets `editor`, `template`, `surfaces`, `autosave`,
  `exportRenderer` and the preflight inputs from `useStudio()`; the variant comes from
  `services.printConfig` (added in Task 9; until then `VARIANT_OK`).
- [ ] **Step 4: Run** — PASS; `tsc` clean for the two new files.
- [ ] **Step 5: Commit** `feat(design): render and submit a design's bundle without the studio`

### Task 7: "Thiết kế của tôi"

**Files:**
- Modify: `components/design-list-screen.tsx`, `design-card.tsx`, `design-list-states.tsx`,
  `design-status-badge.tsx`, `src/app/(storefront)/design/page.tsx`
- Create: `components/delete-design-dialog.tsx`, `components/new-design-dialog.tsx`
- Test: `__tests__/design-list-screen.test.tsx` (rewrite), `__tests__/new-design-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 5 `useDesignList`, `useDraftCount`, `useDeleteDesign`, `useCreateRevision`,
  `allowedActions`, `DESIGN_STATUS_META`, `designCardView`, `isReturned`.
- Produces:
  - `DesignStatusBadge({ status, returned?, className? })`.
  - `NewDesignDialog({ products, open, onOpenChange })` where
    `products: { slug: string; title: string; variants: { sku: string; label: string }[] }[]`
    (the page maps the catalog query to this); after picking it asks `usePrintConfig` for the chosen
    variant and only enables "Bắt đầu" when one exists; it navigates to
    `STORE_ROUTES.design.newFor(slug, sku)`.

- [ ] **Step 1: Write the failing tests:**
  - tabs "Tất cả / Bản nháp / Chờ duyệt / Đã duyệt" live in `?tab=` and switching resets `?page=`
  - header shows "2/50 bản nháp" from `useDraftCount`
  - a card per seeded status: DRAFT shows "Tiếp tục thiết kế" + "Xoá"; returned DRAFT shows the
    "Bị trả lại" badge and the reason; PENDING_REVIEW shows only "Xem"; APPROVED shows "Xem" +
    "Tạo bản sửa"; ARCHIVED never appears
  - "Xoá" → confirm dialog "Xoá bản nháp này?" → the card disappears and the count drops
  - "Tạo bản sửa" navigates to the new draft's studio
  - empty account → "Bạn chưa có thiết kế nào" + "Xem sản phẩm"; empty tab → "Xem tất cả"
  - `NewDesignDialog`: a variant without a print config (`MOCK_SKU_WITHOUT_PRINT_CONFIG`) keeps
    "Bắt đầu" disabled with "Quy cách này chưa nhận thiết kế."
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; the list page passes the catalog products (existing catalog list hook,
  composed in `src/app/(storefront)/design/page.tsx`) to the dialog.
- [ ] **Step 4: Run** — PASS; `tsc` clean for these files.
- [ ] **Step 5: Commit** `feat(design): my designs follow the docs' statuses`

### Task 8: Launcher, product-page entry and catalog wording

**Files:**
- Modify: `components/new-design-screen.tsx`, `components/launcher-states.tsx`,
  `src/app/(studio)/design/new/page.tsx`, `src/features/catalog/components/product-detail-screen.tsx`,
  `src/features/catalog/components/product-purchase-panel.tsx`,
  `src/app/(storefront)/catalog/products/[slug]/page.tsx`
- Create: `components/design-entry.tsx`
- Delete: `components/template-choice.tsx`
- Test: `__tests__/new-design-screen.test.tsx` (rewrite),
  `src/app/(studio)/design/new/__tests__/new-design-page.test.tsx`,
  `src/features/catalog/__tests__/product-detail-screen.test.tsx` (update the two button blocks),
  `__tests__/design-entry.test.tsx`

**Interfaces:**
- Consumes: Task 5 `usePrintConfig`, `useDraftCount`, `useCreateDesign`, `defaultDesignName`.
- Produces:
  - `DesignEntry({ productSlug, sku })`: "Thiết kế" link to `STORE_ROUTES.design.newFor(slug, sku)`
    when the print config exists and `variantStatus === "ACTIVE"`; otherwise the text
    "Quy cách này chưa nhận thiết kế" and a "Chat với Sale" link to `STORE_ROUTES.chat.list`.
  - `ProductDetailScreen` prop `renderDesignEntry?: (sku: string) => ReactNode` replaces `designHref`;
    `ProductPurchasePanel` prop `designEntry?: ReactNode`; the quote button text becomes
    "Chat với Sale".

- [ ] **Step 1: Write the failing tests:**
  - launcher states in order: signed out → sign-in prompt, and **no create**; no print config →
    "Quy cách này chưa nhận thiết kế." + "Chat với Sale"; 50 drafts → "Bạn đã có 50 bản nháp" +
    link "Thiết kế của tôi"; otherwise creates with `defaultDesignName(title, label)` and replaces the
    URL with `/design/{id}`
  - **Review Focus 2:** rendered under `<StrictMode>`, one visit calls `createDesign` exactly once
  - `DesignEntry` with and without a print config
  - product page: a customizable product shows "Thiết kế" for a variant with a print config and
    "Chat với Sale" (never "Liên hệ Sale báo giá"); a stock product keeps "Thêm vào giỏ"
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; guard the create with a ref keyed by `product+sku` so a re-run effect
  reuses the in-flight promise.
- [ ] **Step 4: Run** — PASS; `tsc` clean for these files.
- [ ] **Step 5: Commit** `feat(design): start a design from a variant that has a print configuration`

### Task 9: The studio follows the status

**Files:**
- Modify: `components/studio/{design-studio,studio-workspace,studio-context,studio-header,primary-action,status-strip,read-only-banner,decision-history,design-name-field,use-preflight}.tsx/ts`,
  `src/app/(studio)/design/[id]/{page,design-studio-loader}.tsx`
- Create: `components/studio/submit-dialog.tsx`, `components/studio/status-banner.tsx`
- Delete: `workflow-view.tsx`, `workflow-context.tsx`, `workflow-card.tsx`, `finalize-dialog.tsx`,
  `use-finalize.ts`, `change-request-dialog.tsx`, `review-void-guard.tsx`, `confirmed-card.tsx`,
  `review-submit-dialog.tsx`, `review-steps.tsx`; tests `__tests__/workflow-view.test.tsx`,
  `__tests__/workflow.test.tsx`
- Test: `__tests__/design-studio.test.tsx` (rewrite), new `__tests__/studio-status.test.tsx`,
  `__tests__/submit-dialog.test.tsx`; update the `mock-fixtures/designs` imports of
  `brush-background`, `image-tool`, `studio-selection`, `studio-touch`, `studio-unsaved`,
  `studio-viewer`, `text-tool` tests to `__tests__/design-backend.ts` (behaviour unchanged)

**Interfaces:**
- Consumes: Tasks 1, 5, 6.
- Produces:
  - `StudioServices`: drop `capabilities`, `uiState`; add `status: DesignStatus`,
    `readOnly: boolean`, `printConfig: PrintConfig`; `template` is `printConfig.template`.
  - `StudioWorkspaceProps`: drop `capabilities`; add `printConfig: PrintConfig`.
  - `LoadedDesignStudio` loads design, document, assets and the print config
    (`design.product.slug`, `design.variant.sku`), then renders the workspace for every status;
    not found / `ARCHIVED` → `StudioNotFound`.
  - `StatusBanner({ design })`: returned draft → "Bị trả lại lúc {time}: {reason}";
    PENDING_REVIEW → "Đang chờ Quản lý kinh doanh duyệt — gửi lúc {time}"; APPROVED →
    "Đã duyệt lúc {time}" + "Tải ảnh xem trước" (from `useDesignFiles`).
  - `PrimaryAction`: DRAFT → "Gửi duyệt" (opens `SubmitDialog`); APPROVED → "Tạo bản sửa";
    PENDING_REVIEW → nothing.
  - `SubmitDialog({ open, onOpenChange })`: Fail → the issue list (clicking selects the element);
    Pass → confirm body with the preview, "Bản sẽ bị khoá đến khi có kết quả duyệt." and the
    print-colour disclaimer; steps "Ảnh xem trước", "File in", "Đặc tả", "Tải lên"; error →
    "Thử lại".
  - Header: "Lưu" button and Ctrl+S call `autosave.flush()`; the name field renames through
    `useRenameDesign` (Enter or blur), only when `allowedActions` has `rename`.
  - Read-only (`!DESIGN_STATUS_META[status].editable`): tool rail and tool panel hidden, 2D stage
    and 3D viewer stay interactive for viewing.

- [ ] **Step 1: Write the failing tests:**
  - per status: DRAFT shows the tool rail, "Lưu", "Gửi duyệt"; PENDING_REVIEW hides tools and shows
    the waiting banner; APPROVED hides tools, shows "Đã duyệt lúc …" and "Tạo bản sửa"; ARCHIVED and
    an unknown id show "Không tìm thấy thiết kế"
  - returned draft shows the reason banner
  - Ctrl+S flushes autosave once; renaming to 201 characters shows "Tên tối đa 200 ký tự"
  - submit dialog Fail lists issues and records the failure; Pass walks the steps and leaves the
    studio read-only
  - **Review Focus 3:** a save answered `409 INVALID_STATE` refetches the design and the studio turns
    read-only; the offline draft still holds the unsaved edit
  - a save answered `409 VERSION_CONFLICT` still opens the existing conflict dialog (autosave uses
    `isDesignConflict`, now keyed on `VERSION_CONFLICT`)
  - "Tạo bản sửa" opens the new draft
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; delete the old workflow files; point the moved tests at
  `design-backend.ts`.
- [ ] **Step 4: Run** `pnpm exec vitest run src/features/product-design` — PASS.
- [ ] **Step 5: Commit** `feat(design): the studio follows the docs' statuses`

### Task 10: Close the switch window

**Files:**
- Any file still failing `pnpm run typecheck` or `pnpm run lint` after Task 9 (expected: `index.ts`
  re-exports, `src/app/(studio)/design/[id]/*`, catalog tests).

- [ ] **Step 1: Run** `pnpm run validate` and list the failures.
- [ ] **Step 2: Fix** each failure in place (no `any`, `@ts-ignore` or `eslint-disable`).
- [ ] **Step 3: Run** `pnpm run validate` — Expected: typecheck, lint, test and build all pass.
- [ ] **Step 4: Commit** `fix(design): close the switch to the docs' lifecycle`

### Task 11: Reviewer simulation panel

**Files:**
- Create: `src/features/product-design/simulation.ts`, `components/mock-review-panel.tsx`
- Modify: `src/app/(studio)/layout.tsx`, `src/app/(storefront)/design/page.tsx`
- Test: `__tests__/mock-review-panel.test.tsx`

**Interfaces:**
- Consumes: Task 3 `/__mock/*` routes; Task 5 `invalidateDesign`, `designKeys`.
- Produces: `simulateApprove(id)`, `simulateReturn(id, { reason })`, `resetMockData()` in
  `simulation.ts` (the only callers of `/__mock/*`); `MockReviewPanel({ designId? })` rendered when
  `useIsMock() || DESIGN_API_MOCKED`: floating button "Giả lập Quản lý kinh doanh"; for a
  `PENDING_REVIEW` design "Duyệt" and "Trả lại" (reason textarea, react-hook-form +
  `returnReasonInputSchema`); always "Xoá dữ liệu mock" (confirm); when storage is memory-only the
  note "Dữ liệu giả lập sẽ mất khi tải lại trang."

- [ ] **Step 1: Write the failing tests:** approve turns the open studio to APPROVED with the banner;
  return with an empty reason shows "Hãy nhập lý do", with 2001 characters "Lý do tối đa 2000 ký tự",
  with a valid one turns it to a returned DRAFT; reset reseeds the list; the panel is absent when
  neither flag is set.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS; `pnpm run validate` — PASS.
- [ ] **Step 5: Commit** `feat(design): a reviewer simulation for the mock`

### Task 12: Rules, superseded specs, and the end-to-end check

**Files:**
- Modify: `.claude/rules/mode-b-storefront.md` (Module 12 lines 55–59),
  `docs/superpowers/specs/2026-10-25-design-studio-3d-design.md`,
  `docs/superpowers/specs/2026-10-25-design-api-be-proposal.md`
- Modify with permission only: `src/_design/FRONTEND-AI-RULES.md` (lines 124, 196–197, 257, 266)

- [ ] **Step 1: Update `mode-b-storefront.md`** Module 12: replace the four lines named in spec §11
  with "Preflight is Pass or Fail; Fail blocks submitting for review.", "A design is bound to one
  variant; its print configuration decides the dieline.", "Only an `APPROVED` design can be quoted
  (part D).", keep the desktop-only, preflight-visible and colour-disclaimer lines.
- [ ] **Step 2: Ask the user in chat** for permission to edit `src/_design/FRONTEND-AI-RULES.md` with
  the same content; edit only after an explicit yes (the hook blocks it otherwise).
- [ ] **Step 3: Add** to the top of both 2026-10-25 specs: "> Superseded for lifecycle, data contract
  and workflow screens by `2026-11-09-design-module12-a-foundation-design.md`."
- [ ] **Step 4: Browser check** with `USE_MOCK=false` (temporary launch configuration, reverted
  afterwards): from a product page "Thiết kế" → launcher → studio; design, reload (IndexedDB keeps
  it), "Gửi duyệt" with a failing design (issues shown), fix, submit; "Trả lại" in the panel; fix,
  resubmit; "Duyệt"; "Tạo bản sửa"; delete a draft; reload between steps. Then the same with
  `USE_MOCK=true`. Screenshot each status.
- [ ] **Step 5: Run** `pnpm run validate` — PASS.
- [ ] **Step 6: Commit** `docs(design): rules and older specs follow the docs' lifecycle`
