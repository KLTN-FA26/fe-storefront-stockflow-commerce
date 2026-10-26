# Design API — change request for the BE team

- Date: 2026-10-26
- Status: proposal, not yet reviewed by the BE team. Everything below is **proposed**; none of it is served by `origin/develop` today.
- Written by: storefront (Module 12, Design Studio 3D). Source spec: `docs/superpowers/specs/2026-10-25-design-studio-3d-design.md` (§2.3 gaps G1–G11, §7.2 proposals P1–P6).
- BE baseline read: `origin/develop` @ `92bcd760` — `design` module (`DesignWorkflowController`, `DesignController`, `DesignWorkflowService`, `DesignArtifactService`), `product` migrations `V20260928001100`–`001300`, identity seed `V20260903000100`, `common/storage`, `ErrorCode`.
- The storefront already runs against a mock of everything below (`src/lib/api/mock-design.ts` over `src/lib/api/mock-fixtures/designs.ts`). The mock is the executable form of this document: where the two disagree, this document is what we ask for, and the difference is a mock bug we will fix.

## 1. What we ask for, in one table

The storefront lets a signed-in B2B customer design a printed cup or kraft bag on a 3D model and send it to QC and Sales. The BE already has the review and confirmation workflow; what is missing is everything before it (starting a design, knowing what may be printed, storing the design itself) and a few fields the list and the status screens need.

| Gap | What is wrong today                                                                                                                          | Change requested                                                                                                        | Section |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| G1  | `POST /designs` needs `design-administration:CREATE` (ECOMMERCE_ADMIN only) and an explicit QC reviewer: a customer cannot start a design    | **P1** `POST /designs/mine`                                                                                             | 4.1     |
| G2  | `product.customization_templates` and `product.print_areas` have tables but no API: the storefront cannot load print areas, DPI or the model | **P2** `GET /catalog/products/{slug}/customization`                                                                     | 4.2     |
| G3  | `CatalogProductResponse` and `CatalogCardResponse` have no `kind`: the PDP cannot tell a customizable product from a standard one            | **P2** `kind` on both responses                                                                                         | 4.2     |
| G4  | Docs say "canvas JSON"; the code stores only `spec` (4000 characters) and artifacts reject JSON: no editable design is stored                | **P3** `GET` / `PUT /designs/{id}/document`                                                                             | 4.3     |
| G5  | `design-assets/*` is documented, not implemented; uploading a logo as an artifact replaces the current preview and resets the review         | **P4** `/designs/{id}/assets`                                                                                           | 4.4     |
| G6  | No automatic preflight (DPI, safe area, fonts): the BE "preflight" is the manual QC flag                                                     | **No BE change.** The storefront preflights in the browser; QC stays the gate                                           | —       |
| G7  | Docs 12 lifecycle (`Ready/Confirmed/Locked/…`) differs from the BE (`DRAFT/SUBMITTED/APPROVED`)                                              | **No BE change.** The storefront follows the BE vocabulary                                                              | —       |
| G8  | No print-ready generation (PDF / CMYK with bleed)                                                                                            | **No BE change requested now.** The storefront uploads an RGB PDF as `PRINT_READY`; CMYK conversion stays with prepress | —       |
| G9  | No signal "the customer finished, please review"                                                                                             | **P5** `POST /designs/{id}/technical-review-requests`                                                                   | 4.5     |
| G10 | `DesignDraftResponse` lacks the product slug, SKU, template, timestamps and preview; `GET /designs` cannot be filtered by status             | **P6** extra response fields and a `status` filter                                                                      | 4.6     |
| G11 | No column for the parametric model parameters (cup and bag dimensions)                                                                       | **G11** `customization_templates.model_params_json`                                                                     | 4.7     |

## 2. Conventions every example follows

These are the BE's own conventions; they are repeated so the examples can be read alone.

- Success: `{ "success": true, "data": …, "timestamp": … }`. Failure: `{ "success": false, "errorCode", "message", "fieldErrors"?, "correlationId", "timestamp" }`. The storefront branches on `errorCode`, never on `message`.
- `default-property-inclusion: non_null`: a null field is **absent**, never `null`. Examples omit absent fields.
- Pages are zero-based (`PageResponse`); `size` above 200 or a negative `page` is `400 UNSUPPORTED_PARAMETER`.
- `version` is the draft's optimistic-lock token. Every write that changes the draft takes the caller's `version` and answers a stale one with `409 CONFLICT`; every such write bumps it. This includes the new document `PUT` and `P5`.
- A design the caller neither owns, is assigned to nor reviews is `404 NOT_FOUND` on every endpoint, new ones included (as `DesignWorkflowService#access` does today).
- The HTTP status is a property of the `ErrorCode` (`VALIDATION_FAILED` is 400): a request the BE refuses as invalid, an invalid design document included, is `400 VALIDATION_FAILED` with `fieldErrors`. The only `422`s here are the existing `IDEMPOTENCY_KEY_REUSED` and the new `TEMPLATE_NOT_FOUND`, which is declared as 422 when it is added (§5).
- Ids are UUIDs; instants are ISO-8601 `Instant`s.
- Uploads: `Idempotency-Key` header, `userId`-scoped, validated by `IdempotencyKeys.validate`. A blank key is `400 VALIDATION_FAILED`.

## 3. Rules the new endpoints must honour (they apply to several sections)

1. **Every draft created through P1 always has a document.** `POST /designs/mine` stores the empty document of the template (§4.3) in the same transaction, at version 0. `POST /designs/{id}/revisions` (fork) stores a copy of the confirmed snapshot's document in the new draft. Consequently `GET /designs/{id}/document` never answers `404` for a design the caller may see and that was created through P1 or forked from one. Drafts created through the staff `POST /designs` (and rows that predate this change) have no SKU, template or document: for those `GET /document` answers `404 NOT_FOUND` (ASSUMPTION, open question Q5).
2. **A change to the document, the specification or an artifact voids the technical review**: `technicalReviewPassed = false`, `reviewNotes`, `reviewedAt` and `reviewRequestedAt` cleared — what `DesignDraftJpaEntity#revise` and `attachArtifact` already do for the first two. Images (P4) do not: they are not part of what QC reviewed until the document references them.
3. **Editing needs the same guards as `revise`** (`DesignWorkflowService#editable`): version match (`409 CONFLICT`), caller is owner or assigned designer (`403 FORBIDDEN`), draft not APPROVED / no snapshot (`409 CONFLICT`, "Create a new draft for confirmed content"), status DRAFT (`409 CONFLICT`, "Withdraw the pending confirmation before editing"). The caller becomes the draft's last editor (so the existing "reviewer is not the last editor" check keeps meaning something).
4. **Idempotency (`IDEMPOTENCY_KEY_REUSED`).** A retried upload with the same `Idempotency-Key` and the **same file** (checksum, original name, content type) replays the first answer (`201`, same body) even if the draft has moved on. The same key with a **different** file is `422 IDEMPOTENCY_KEY_REUSED` — the existing `ErrorCode`, the same behaviour `DesignArtifactService` has today. Keys are scoped per user (images) and per user and role (artifacts).
5. **Presigned `GET` links must allow CORS from the storefront.** The studio does not only show a picture in an `<img>`: it `fetch`es the bytes of every placed image (P4) to decode it into the canvas the print file and the 3D textures are drawn from, and reads artifacts the same way. The object store (bucket CORS, or the proxy in front of it) must answer `GET` and `HEAD` on the presigned asset and artifact URLs with `Access-Control-Allow-Origin` for the storefront origins (no credentials; the signature is in the URL). Without it the browser blocks the read and the design shows placeholders instead of the customer's logo. This applies to the existing `GET /designs/{id}/artifacts/{artifactId}/download-url` links too.

## 4. Changes

### 4.1 P1 — `POST /designs/mine` (G1)

A customer starts a design from a template of a SKU. The staff-only `POST /designs` is unchanged.

Request (`@NotBlank` on every field, `name` `@Size(max = 200)`):

```json
POST /api/v1/designs/mine
{
  "productId": "7c1f0a00-0000-4000-8000-000000000002",
  "sku": "CUP-PAPER-12OZ-WHT",
  "templateCode": "CUP12-BODY",
  "name": "Ly cà phê Nhà Mình 12oz"
}
```

Response `200` (like `POST /designs`; the storefront accepts any 2xx), a `DesignDraftResponse` (§4.6):

```json
{
  "success": true,
  "data": {
    "id": "3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21",
    "customerId": "c0ffee00-0000-4000-8000-000000000010",
    "productId": "7c1f0a00-0000-4000-8000-000000000002",
    "ownerUserId": "8a1d4c52-7b1e-4a3f-b0f1-5d2c9e7a1b34",
    "reviewerUserId": "2b9c7e10-3d4f-4e6a-8c15-7f0a1d2e3b45",
    "name": "Ly cà phê Nhà Mình 12oz",
    "status": "DRAFT",
    "technicalReviewPassed": false,
    "version": 0,
    "productSlug": "ly-giay-2-lop-12oz",
    "sku": "CUP-PAPER-12OZ-WHT",
    "templateCode": "CUP12-BODY",
    "updatedAt": "2026-10-26T08:00:00Z"
  },
  "timestamp": "2026-10-26T08:00:00Z"
}
```

Rules:

- **Owner and customer come from the caller**, never from the body: `ownerUserId` = the authenticated user, `customerId` = that user's customer profile (`CustomerService#findByUserId`). The caller must be an active `CUSTOMER`; a caller with no customer profile, or a staff caller, is `403 FORBIDDEN` (ASSUMPTION, open question Q8).
- **The reviewer is assigned by the BE** from the active `QC_STAFF` pool (strategy is the BE's choice: round-robin, fewest open reviews, …). It must differ from the owner, as `create` already requires. No active QC user: `409 CONFLICT`. `assignedUserId` (designer) stays absent; Sales can assign one through `PUT /designs/{id}/assignment`.
- `spec` stays absent until the customer writes it (`PUT /specification`). `design_draft.spec` is already nullable.
- The product must exist and be visible in the catalogue: `404 PRODUCT_NOT_FOUND`. Its `kind` must be `CUSTOMIZABLE`: `409 PRODUCT_NOT_CUSTOMIZABLE` (new code). `sku` must be a variant of that product with an active template whose `code` is `templateCode`: `422 TEMPLATE_NOT_FOUND` (new code).
- Stores `sku`, `templateCode` and the empty document (§3.1, §4.3). No decision-log entry is required (`DesignWorkflowService#create` writes none today).
- Errors: `400 VALIDATION_FAILED` with `fieldErrors` (blank field, `name` over 200), `404 PRODUCT_NOT_FOUND`, `409 PRODUCT_NOT_CUSTOMIZABLE`, `422 TEMPLATE_NOT_FOUND`, `403 FORBIDDEN`.

```json
{
  "success": false,
  "errorCode": "PRODUCT_NOT_CUSTOMIZABLE",
  "message": "This product cannot be customized",
  "correlationId": "8f3a0c1e-…",
  "timestamp": "2026-10-26T08:00:00Z"
}
```

### 4.2 P2 and G3 — customization templates and `kind` (G2, G3)

**`kind`.** `product.products.kind` (`STANDARD` | `CUSTOMIZABLE`, `ck_products_kind`) already exists. Add `kind` to `CatalogProductResponse` (`GET /catalog/products/{slug}`) and to `CatalogCardResponse` (`GET /catalog/products`), always present:

```json
{
  "productId": "…",
  "slug": "tui-giay-kraft",
  "title": "Túi giấy kraft quai xoắn",
  "kind": "CUSTOMIZABLE"
}
```

The storefront shows "Bắt đầu thiết kế" only for `CUSTOMIZABLE`. A response without `kind` (today's BE) is read as "not known to be customizable".

**Templates.** `GET /catalog/products/{slug}/customization`, in `StorefrontCatalogController`: same security as the other catalogue reads (a signed-in customer or staff member, no `design-*` permission), `Cache-Control: no-store`. It needs no price: a customizable product whose detail still answers `409 PRICE_NOT_AVAILABLE` must still answer here.

```json
GET /api/v1/catalog/products/ly-giay-2-lop-12oz/customization
{
  "success": true,
  "data": {
    "productId": "7c1f0a00-0000-4000-8000-000000000002",
    "kind": "CUSTOMIZABLE",
    "templates": [
      {
        "templateId": "9b0e5d3c-1a42-4f7e-a8b6-2c4d6e8f0a12",
        "code": "CUP12-BODY",
        "name": "Ly giấy 12oz – thân ly",
        "sku": "CUP-PAPER-12OZ-WHT",
        "minDpi": 150,
        "colorMode": "CMYK",
        "allowedFileFormats": ["image/png", "image/jpeg", "image/webp"],
        "maxFileSizeMb": 20,
        "model": {
          "kind": "parametric-cup",
          "topDiameterMm": 90,
          "bottomDiameterMm": 60,
          "heightMm": 110,
          "rimMm": 3,
          "seamMm": 8,
          "bandTopOffsetMm": 6,
          "bandBottomOffsetMm": 8,
          "material": "paper-white"
        },
        "printAreas": [
          {
            "code": "BODY",
            "name": "Thân ly",
            "xMm": 0,
            "yMm": 0,
            "widthMm": 279.67,
            "heightMm": 120.85,
            "safeMarginMm": 3,
            "bleedMm": 2,
            "shape": {
              "type": "annular-sector",
              "innerRadiusMm": 230.04,
              "outerRadiusMm": 327.05,
              "sweepRad": 0.84894,
              "seamMm": 8
            },
            "uvMapping": { "meshPart": "body" }
          }
        ]
      }
    ]
  },
  "timestamp": "2026-10-26T08:00:00Z"
}
```

One entry per **active** template of the product's variants (`is_active`), in a stable order. **A design must stay openable after its template is deactivated**: a confirmed design (read-only) and its forks still need the template's print areas and model. Either P2 keeps returning a template that existing designs reference (flagged, for example `"active": false`, so the storefront does not offer it for new designs), or a `GET /designs/{id}/template` returns the template the design was made with (frozen when the design was created, the same JSON as one `templates[]` entry). The storefront asks for the second only if the BE prefers it; until then a design whose template P2 no longer lists opens in the workflow-only view (§9), without the editor. A bag template has four rect print areas (`FRONT`, `BACK`, `LEFT`, `RIGHT`, `"shape": { "type": "rect" }`, `"uvMapping": { "meshPart": "front" }`, …) and a `parametric-bag` model:

```json
"model": {
  "kind": "parametric-bag", "widthMm": 260, "gussetMm": 120, "heightMm": 320, "topFoldMm": 40,
  "handle": "twisted", "material": "kraft-brown"
}
```

How the columns map to the JSON:

| JSON                                                   | Source                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `templateId`, `code`, `name`                           | `customization_templates.id`, `code`, `name`                                       |
| `sku`                                                  | the SKU of the template's variant (`variant_id`): a template hangs off the variant |
| `minDpi`, `colorMode`, `maxFileSizeMb`                 | `min_dpi`, `color_mode`, `max_file_size_mb`                                        |
| `allowedFileFormats`                                   | `allowed_file_formats`, as **MIME types** (below)                                  |
| `maxColors`                                            | `max_colors`; **absent** when null                                                 |
| `allowedFontCodes`                                     | `allowed_font_codes`; **absent when null or empty — no restriction** (below)       |
| `model`                                                | `model_params_json` (§4.7)                                                         |
| `printAreas[]`                                         | `print_areas` ordered by `sort_order`                                              |
| `printAreas[].code`, `name`, `safeMarginMm`, `bleedMm` | `code`, `name`, `safe_margin_mm`, `bleed_mm`                                       |
| `printAreas[].xMm`, `yMm`, `widthMm`, `heightMm`       | `x_mm`, `y_mm`, `width_mm`, `height_mm` (bounding box on the 2D template)          |
| `printAreas[].shape`, `uvMapping`                      | `shape_json`, `uv_mapping_json`                                                    |
| not exposed in v1                                      | `template_2d_url`, `model_3d_url`, `is_active`                                     |

`allowedFileFormats` is MIME. The column holds short names today: the QA seed (`tools/db/qa/01_warehouse_pim.sql`) writes `ARRAY['PNG']` and `tools/db/seed/seed_test_data.sql` writes `PDF, AI, PNG`. The API must send MIME types (`image/png`), which is also what `FileCategory` compares. **Store MIME types in the column** and change the seeds (`ARRAY['image/png','image/jpeg','image/webp']`); a mapping in the service is the alternative. The storefront accepts only `image/png`, `image/jpeg` and `image/webp` in the editor, and as a safety net maps `PNG`, `JPG`, `JPEG` and `WEBP` to MIME itself; any other value (`PDF`, `AI`) it cannot map and the editor will not accept those files.

`allowedFontCodes`: a null **or empty** array means no restriction (every font the storefront ships); the API omits the field in both cases. A non-empty array restricts the editor's font list to those codes (the keys of the storefront's font registry, for example `be-vietnam-pro`).

Errors: `404 NOT_FOUND` (unknown or unpublished slug), `409 PRODUCT_NOT_CUSTOMIZABLE` (a `STANDARD` product).

### 4.3 P3 — the design document (G4)

The editable design is a JSON document (millimetres, one surface per print area) owned by the storefront. The BE stores it, versions it with the draft and freezes it at confirmation. It does not interpret it beyond the checks below.

```json
GET /api/v1/designs/3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21/document
{
  "success": true,
  "data": {
    "designId": "3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21",
    "version": 3,
    "document": {
      "schemaVersion": 1,
      "templateCode": "CUP12-BODY",
      "sku": "CUP-PAPER-12OZ-WHT",
      "surfaces": {
        "BODY": {
          "background": { "kind": "color", "color": "#F5EFE6" },
          "elements": [
            {
              "id": "el-cup-1", "type": "text", "name": "Nhà Mình", "hidden": false, "locked": false,
              "opacity": 1, "placement": { "u": 118, "v": 55, "rotationDeg": 0, "scale": 1 },
              "content": "Nhà Mình", "fontCode": "be-vietnam-pro", "sizePt": 24, "color": "#3B2A1E",
              "align": "center", "bold": true, "italic": false, "letterSpacingEm": 0, "lineHeight": 1.2
            }
          ]
        }
      }
    },
    "checksum": "83ca6f710700f909366f583cc74ecfa79d84ad40593bd36af40330ad239cd203",
    "updatedAt": "2026-10-26T07:55:00Z"
  },
  "timestamp": "2026-10-26T08:00:00Z"
}
```

`PUT /designs/{id}/document` takes `{ "version", "document" }` and answers the same shape with the **new** draft `version`, the new `checksum` and `updatedAt`:

```json
PUT /api/v1/designs/3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21/document
{ "version": 3, "document": { "schemaVersion": 1, "templateCode": "CUP12-BODY", "sku": "CUP-PAPER-12OZ-WHT", "surfaces": { "BODY": { "background": { "kind": "none" }, "elements": [] } } } }
```

- `version` in the answer of `GET` is the draft's current `version`, so the caller can write straight away. The document shares the draft's `version`: one optimistic lock for the draft and its content.
- A `PUT` follows §3.2 and §3.3: it voids the technical review and bumps `version`. It does **not** write a decision-log entry (the storefront saves every 1.5 s while the customer edits; a log row per save would bury the real decisions).
- **Size**: the serialised `document` is at most **1,000,000 bytes** (UTF-8): `413 PAYLOAD_TOO_LARGE`. The servlet and gateway request-size limits must admit that plus the envelope.
- **Validation** is shallow, and answers `400 VALIDATION_FAILED` (no new code) with a `fieldErrors` entry `{ "field": "document", "message": … }`: `schemaVersion` is `1`; `templateCode` and `sku` equal the draft's; `surfaces` is an object whose keys are print-area codes of the template; every surface has an `elements` array. The element schema belongs to the storefront; the BE must keep unknown element fields as sent (store as received).
- **Checksum**: lower-case hex SHA-256 of the document's **canonical JSON** — [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (keys sorted by UTF-16 code unit, ECMAScript number formatting, no whitespace). The storefront computes the same value in the browser and quotes it in the specification text, so the two must agree byte for byte; the BE therefore needs an RFC 8785 implementation and must not hash its own JSONB re-serialisation. The empty document of a template (§3.1) has a checksum like any other.
- **Confirmation** (`POST /confirmations`) freezes the document and its checksum into the snapshot: add `document` (JSONB) and `document_checksum` to `design.design_snapshot`, written at insert (the immutability trigger forbids later writes). **Snapshot checksum.** The BE's `manifestChecksum` hashes `ROLE:artifactId:checksum\n` per manifest entry, sorted by role. We ask to append one more line, `DESIGN_DOCUMENT:<document_checksum>\n`, when the draft has a document, so that the one `checksum` an order stores (`designChecksum`) covers the confirmed document as well. **This changes what `DesignServiceImpl` recomputes when it verifies a snapshot for fulfilment** (`manifestChecksum(actualEntries)`, `DesignIntegrityHashTest`, `ConfirmedDesigns` in the test support): the recomputation must include the stored `document_checksum`. If that is too invasive, the alternative is to leave `checksum` as it is and add `documentChecksum` to `DesignSnapshotResponse`, verified separately; the storefront reads either (ASSUMPTION, open question Q2). The mock implements the first option.
- **Fork** (`POST /revisions`) copies the snapshot's document (not the live draft's) into the new draft at version 0, and keeps `sku`, `templateCode` and the template reference. The document's `image` elements refer to customer images by `assetId`: the fork must make those images resolvable in the new draft too (§4.4, open question Q3).
- Access: `GET` needs `design-designs:READ`, `PUT` `design-designs:UPDATE`. Errors: `404 NOT_FOUND`, `409 CONFLICT` (stale version, not DRAFT), `403 FORBIDDEN`, `413 PAYLOAD_TOO_LARGE`, `400 VALIDATION_FAILED` (invalid document).

### 4.4 P4 — customer images (G5)

A logo or photo the customer places on the design. Kept apart from artifacts: an image is **not** a preview, does not change `currentArtifactId`, does not bump the draft `version` and does not void the review.

```
POST /api/v1/designs/{id}/assets            multipart/form-data, part "file"; header Idempotency-Key
GET  /api/v1/designs/{id}/assets            → asset[], newest first
GET  /api/v1/designs/{id}/assets/{assetId}/download-url
```

```json
POST → 201
{
  "success": true,
  "data": {
    "assetId": "5d7f9b1c-2e4a-4c6e-8a0b-1d3f5a7c9e02",
    "designId": "3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21",
    "originalName": "logo.png",
    "contentType": "image/png",
    "widthPx": 1200,
    "heightPx": 800,
    "sizeBytes": 48213,
    "checksum": "ab12…",
    "storedAt": "2026-10-26T08:01:00Z"
  },
  "timestamp": "2026-10-26T08:01:00Z"
}
```

```json
GET …/download-url → 200, Cache-Control: no-store
{ "success": true, "data": { "url": "https://…presigned…", "expiresAt": "2026-10-26T08:06:00Z" }, "timestamp": "…" }
```

- **Storage and limits**: a new private `FileCategory.DESIGN_ASSET` (`design-assets`), `image/png`, `image/jpeg`, `image/webp`, at most **20 MB**; same `BufferedUpload`, magic-number check and ClamAV `UploadInspection` as artifacts. Never CDN-served: access only through the presigned link.
- **`widthPx` / `heightPx`** are read by the BE from the image, so the document can store the natural size and DPI can be computed offline. They must be the size **after the EXIF orientation is applied** (orientations 5–8 swap width and height): browsers decode a JPEG upright, so a portrait phone photo stored as `4032 × 3024` would be stretched into a landscape frame and its DPI computed on the wrong side. An unreadable image is `415 UNSUPPORTED_MEDIA_TYPE`. We also recommend refusing images over 40 megapixels (decompression-bomb guard) with the same code; the mock does not.
- Order of checks, as in `DesignArtifactService#upload`: access (`404`), declared type and size (`415`, `413`), blank key (`400`), replay of the same key (§3.4: `201` with the earlier body, or `422 IDEMPOTENCY_KEY_REUSED`), and only then "is the draft editable" (`409 CONFLICT`: only DRAFT designs accept images).
- A missing `file` part is `400 VALIDATION_FAILED`.
- Images are immutable: there is no update or delete in v1. A confirmed design keeps them; they are referenced by id from the frozen document. Whether the snapshot checksum should also cover each referenced image's `checksum` is left open (Q3).
- Access: `POST` needs `design-designs:UPDATE`, the two `GET`s `design-designs:READ`; the owner, assigned designer and reviewer can read, the owner and assigned designer can upload. Another user's design is `404`.

### 4.5 P5 — "the customer is done, please review" (G9)

```json
POST /api/v1/designs/3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21/technical-review-requests
{ "version": 5 }
```

Response: the `DesignDraftResponse`, with `reviewRequestedAt` set and `version` bumped:

```json
{
  "success": true,
  "data": {
    "id": "3f6e2a4e-5d0a-4b53-9f1c-0c3a8f6d7e21",
    "status": "DRAFT",
    "technicalReviewPassed": false,
    "currentArtifactId": "e1c3a5b7-9d2f-4a6c-8e0b-3d5f7a9c1e04",
    "previewArtifactId": "e1c3a5b7-9d2f-4a6c-8e0b-3d5f7a9c1e04",
    "version": 6,
    "reviewRequestedAt": "2026-10-26T08:10:00Z",
    "updatedAt": "2026-10-26T08:10:00Z"
  },
  "timestamp": "2026-10-26T08:10:00Z"
}
```

- Guards are `editable` (§3.3: version `409`, owner or designer `403`, DRAFT `409`) plus: a current `CUSTOMER_PREVIEW` artifact must exist, else `409 CONFLICT` ("A technical review needs a current preview").
- Effects: any earlier review outcome is cleared (`technicalReviewPassed = false`, `reviewNotes`, `reviewedAt` cleared — a fresh review is awaited); `reviewRequestedAt = now`; `version` + 1; `updatedAt` = `reviewRequestedAt`. The decision log gets `TECHNICAL_REVIEW_REQUESTED` (actor: the caller). The assigned QC reviewer should be notified (notification module); how is the BE's choice.
- **Invariant the storefront relies on**: `reviewRequestedAt` equals `updatedAt` until the next change to the draft. Any later change that voids the review (§3.2) clears `reviewRequestedAt`, so "awaiting review" is exactly "DRAFT, `reviewRequestedAt` set, no review yet".
- The QC reviewer's existing `POST /designs/{id}/technical-reviews` is unchanged.
- The customer writes the specification (`PUT /specification`) **before** this call: `ck_snapshot_confirmation` requires a non-null `spec` on a confirmed snapshot, so a design without one can never be confirmed. We suggest answering `409 CONFLICT` here when `spec` is blank (Q1); the storefront already sends it first and the mock does not enforce it.
- Access: `design-designs:UPDATE`. Errors: `404`, `403`, `409` as above, `400 VALIDATION_FAILED` (negative version).

### 4.6 P6 — `DesignDraftResponse` additions and a status filter (G10)

Seven new optional fields, absent when unknown (non_null):

| Field               | Meaning                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productSlug`       | Slug of the catalogue product the design is for. The draft only carries `productId`, but the catalogue and P2 are keyed by slug: the storefront needs it to link to the product page and to load the template. Looked up when the draft is read (a join, not stored); absent when the product is no longer published. |
| `sku`               | The variant the design is printed on (P1). Absent for drafts created through `POST /designs`.                                                                                                                                                                                                                         |
| `templateCode`      | The template used (P1). Absent likewise.                                                                                                                                                                                                                                                                              |
| `reviewRequestedAt` | When the customer asked for a technical review (P5); cleared whenever the review is voided.                                                                                                                                                                                                                           |
| `reviewedAt`        | When QC recorded its last decision (`POST /technical-reviews`); cleared whenever the review is voided.                                                                                                                                                                                                                |
| `updatedAt`         | Last modification of the draft (any write that bumps `version`): `last_modified_at`.                                                                                                                                                                                                                                  |
| `previewArtifactId` | The current `CUSTOMER_PREVIEW` artifact: `current_artifacts->>'CUSTOMER_PREVIEW'`. Equal to `currentArtifactId` today; named explicitly so the thumbnail does not depend on what `currentArtifactId` may come to mean.                                                                                                |

Existing fields are untouched.

`GET /designs` gains an optional `status` filter:

```
GET /api/v1/designs?status=DRAFT&page=0&size=12
```

Values are the `DesignStatus` names (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, exact case); any other value is `400 UNSUPPORTED_PARAMETER`. It narrows the caller's own list (owner, assigned designer or reviewer); the order (`createdAt` descending, then `id` descending), paging and visibility are unchanged. Without the parameter the answer is what it is today. Needs `DesignDraftJpaRepository#findForUser` to take the status.

### 4.7 G11 — `customization_templates.model_params_json`

The 3D preview builds the cup or bag from dimensions. There is no column for them, so P2's `model` cannot be served.

```sql
ALTER TABLE product.customization_templates ADD COLUMN model_params_json JSONB;
```

`model_params_json` holds exactly the `model` object of §4.2: a `parametric-cup` or `parametric-bag` (all lengths in millimetres, see the two examples above). Constraints worth adding: `model_params_json->>'kind' IN ('parametric-cup','parametric-bag','gltf')` and the object is required for an active template. Where a template has a `model_3d_url`, the model object may instead be `{ "kind": "gltf", "url": "…", "surfaces": [{ "printAreaCode": "BODY", "meshName": "Body" }] }` (accepted by the storefront contract, not enabled in v1). Carrying the parameters in `print_areas.uv_mapping_json` is the alternative if a column is unwanted, but the model belongs to the template, not to a print area.

`print_areas.shape_json` of a cup holds a copy of the trim sector derived from the model (`innerRadiusMm`, `outerRadiusMm`, `sweepRad`, `seamMm`); the storefront checks that the copy agrees with the geometry it derives from the model to within 0.1 mm and rejects the template otherwise, so the two must be seeded from the same numbers.

## 5. Error codes

| Code                       | Status | New | Where                                                                                                                 |
| -------------------------- | ------ | --- | --------------------------------------------------------------------------------------------------------------------- |
| `PRODUCT_NOT_CUSTOMIZABLE` | 409    | yes | P1, P2: the product is `STANDARD`                                                                                     |
| `TEMPLATE_NOT_FOUND`       | 422    | yes | P1: no active template `templateCode` for that SKU of that product                                                    |
| `PRODUCT_NOT_FOUND`        | 404    | no  | P1: unknown or unpublished product                                                                                    |
| `NOT_FOUND`                | 404    | no  | P2 unknown slug; every endpoint for a design the caller may not see                                                   |
| `CONFLICT`                 | 409    | no  | stale `version`, not DRAFT, no current preview (P5), no QC available (P1)                                             |
| `FORBIDDEN`                | 403    | no  | not owner / designer; staff or profile-less caller on P1                                                              |
| `VALIDATION_FAILED`        | 400    | no  | blank or oversized fields; a document that is not this design's (field error on `document`); missing multipart `file` |
| `UNSUPPORTED_PARAMETER`    | 400    | no  | `status` filter, artifact `role`, page and size bounds                                                                |
| `PAYLOAD_TOO_LARGE`        | 413    | no  | document over 1,000,000 bytes (P3); image over 20 MB (P4)                                                             |
| `UNSUPPORTED_MEDIA_TYPE`   | 415    | no  | image that is not png / jpeg / webp or cannot be read (P4)                                                            |
| `IDEMPOTENCY_KEY_REUSED`   | 422    | no  | same `Idempotency-Key`, different file (P4, artifacts)                                                                |

Only the first two are new codes; the storefront reads `errorCode`, so please keep the names.

## 6. Permissions

All checks are in addition to the service-level ones (owner, assigned designer, reviewer; version; DRAFT).

| Endpoint                                          | `@RequiresPermission`   | Who has it today                                                                                 | Change                                                                                                                                                                                                           |
| ------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 `POST /designs/mine`                           | `design-designs:CREATE` | `CUSTOMER`, `SALES_STAFF`, `ECOMMERCE_ADMIN` (seed `V20260903000100`, resource `design-designs`) | Declare `Action.CREATE` in `DesignController`'s `@PermissionResource` (it lists `VIEW_PAGE, READ, UPDATE, APPROVE`) so code and catalogue agree. The service then requires the caller to be an active `CUSTOMER` |
| P2 `GET /catalog/products/{slug}/customization`   | none (signed-in)        | like the rest of `StorefrontCatalogController`                                                   | none                                                                                                                                                                                                             |
| P3 `GET /designs/{id}/document`                   | `design-designs:READ`   | `CUSTOMER`, staff, `QC_STAFF`                                                                    | none                                                                                                                                                                                                             |
| P3 `PUT /designs/{id}/document`                   | `design-designs:UPDATE` | `CUSTOMER`, `SALES_STAFF`, `ECOMMERCE_ADMIN`                                                     | none                                                                                                                                                                                                             |
| P4 `GET /designs/{id}/assets`, `…/download-url`   | `design-designs:READ`   | as above                                                                                         | none                                                                                                                                                                                                             |
| P4 `POST /designs/{id}/assets`                    | `design-designs:UPDATE` | as above                                                                                         | none                                                                                                                                                                                                             |
| P5 `POST /designs/{id}/technical-review-requests` | `design-designs:UPDATE` | as above                                                                                         | none                                                                                                                                                                                                             |
| P6 `GET /designs?status=`                         | `design-designs:READ`   | as today                                                                                         | none                                                                                                                                                                                                             |

The customer role needs `design-designs:CREATE` for P1 and `design-designs:UPDATE` for the writes of P3–P5; both are already granted to `CUSTOMER` by the identity seed. The existing reviewer-only `design-designs:APPROVE` (`POST /technical-reviews`) stays with `QC_STAFF`.

## 7. Data model sketch (non-binding)

```sql
-- P1, P5, P6
ALTER TABLE design.design_draft
    ADD COLUMN sku                  VARCHAR(64),
    ADD COLUMN template_code        VARCHAR(50),
    ADD COLUMN review_requested_at  TIMESTAMPTZ,
    ADD COLUMN reviewed_at          TIMESTAMPTZ;
-- productSlug: joined from the catalogue by product_id; previewArtifactId: current_artifacts->>'CUSTOMER_PREVIEW'.

-- P3: one document per draft, written with the draft (same version)
CREATE TABLE design.design_document (
    draft_id    UUID        NOT NULL PRIMARY KEY REFERENCES design.design_draft (id) ON DELETE CASCADE,
    document    JSONB       NOT NULL,      -- or TEXT: it is hashed as RFC 8785, never from a re-serialisation
    checksum    CHAR(64)    NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
    updated_at  TIMESTAMPTZ NOT NULL
);
ALTER TABLE design.design_snapshot
    ADD COLUMN document          JSONB,
    ADD COLUMN document_checksum CHAR(64);

-- P4: customer images; (draft_id, id) so a fork can carry the same ids (Q3)
CREATE TABLE design.design_asset (
    draft_id      UUID         NOT NULL REFERENCES design.design_draft (id),
    id            UUID         NOT NULL,
    storage_key   VARCHAR(500) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    content_type  VARCHAR(64)  NOT NULL,
    width_px      INTEGER      NOT NULL CHECK (width_px > 0),
    height_px     INTEGER      NOT NULL CHECK (height_px > 0),
    size_bytes    BIGINT       NOT NULL CHECK (size_bytes > 0),
    checksum      CHAR(64)     NOT NULL,
    upload_key    VARCHAR(200),
    stored_at     TIMESTAMPTZ  NOT NULL,
    PRIMARY KEY (draft_id, id)
);
CREATE UNIQUE INDEX uk_design_asset_upload_key ON design.design_asset (draft_id, upload_key) WHERE upload_key IS NOT NULL;

-- G11
ALTER TABLE product.customization_templates ADD COLUMN model_params_json JSONB;
```

## 8. What the storefront mock does that the BE must **not** copy

The mock is for demos and tests. These behaviours exist only there:

- **Automatic QC.** After a `P5` call the mock passes the technical review after 2 seconds (`"Mock QC: đạt kỹ thuật"`) so a demo can go end to end. The real flow is QC's own `POST /technical-reviews`. The mock drops that automatic answer when the design changed since the request, as the real flow would.
- **Download links** are browser object URLs, not presigned URLs; latency (200–500 ms) and a 5 % random 500 are injected by the adapter.
- **The image size** is read in the browser; the BE reads it from the file.
- **The caller** is one fixed customer; ids are random UUIDs; the seed holds three designs (an APPROVED cup with a snapshot, a DRAFT bag, and another customer's design that must be invisible); the APPROVED cup's document places a logo image, which its fork carries along.

## 9. What the storefront does until this ships

- The storefront does not call an endpoint of this proposal until it is switched on (`PROPOSED_ENDPOINTS_LIVE` in `capabilities.ts`); a `404` or `405` from one that is switched on is mapped to `DESIGN_API_UNAVAILABLE`.
- The design list works on today's endpoints (`GET /designs`; the status tabs are hidden without the `status` filter); the new-design launcher says "Tính năng này đang chờ backend hỗ trợ" without P1/P2.
- Without P3/P4 — and for any design without a `productSlug` / `templateCode` (such as one Sales created) or whose template P2 no longer lists — `/design/{id}` opens a **workflow-only view** instead of the editor: the name, the status, what happens next, QC's notes, the `CUSTOMER_PREVIEW` picture (from `GET /designs/{id}/artifacts` and its download link), the decision history (`GET /designs/{id}/history`), and the lifecycle steps of the state on today's endpoints — confirm what Sales sent (`POST /confirmations`), request changes or withdraw it (`/change-requests`, `/confirmation-withdrawals`), the snapshot id once confirmed (`GET /snapshot`), "Tạo phiên bản mới" (`POST /revisions`) and "Yêu cầu báo giá". It says "Tính năng này đang chờ backend hỗ trợ" about editing.
- Missing P6 fields: the status of a design is derived from the BE's own fields (`status`, `technicalReviewPassed`, `reviewNotes`, `currentArtifactId`); "awaiting review" falls back to "DRAFT, current artifact set, no review notes, not passed".
- A product response without `kind` hides "Bắt đầu thiết kế".

## 10. Acceptance scenarios

1. **Start.** A customer calls P1 for a `CUSTOMIZABLE` product's SKU and template: `200`, `status DRAFT`, `version 0`, owner and `customerId` are the caller's, a QC reviewer is assigned, `productSlug`, `sku`, `templateCode` are set; `GET /document` answers the empty document of the template.
2. **Refusals.** P1 for a `STANDARD` product is `409 PRODUCT_NOT_CUSTOMIZABLE`; for a template code the SKU does not have `422 TEMPLATE_NOT_FOUND`; for an unknown product `404 PRODUCT_NOT_FOUND`; a staff caller `403`.
3. **Templates.** P2 for a customizable slug lists its active templates with MIME formats and a `model`; for a standard one `409`; for an unknown one `404`. A template with `allowed_font_codes = '{}'` carries no `allowedFontCodes`.
4. **Document.** `PUT` with the current `version` returns `version + 1` and a checksum equal to the RFC 8785 SHA-256 of the document; the same `PUT` again with the old `version` is `409`; 1,000,001 bytes is `413`; a `templateCode` or a surface code that is not the design's is `400 VALIDATION_FAILED` with a field error on `document`. A `PUT` voids a passed review.
5. **Images.** Uploading the same file twice with one key returns the same `assetId`; another file with that key is `422 IDEMPOTENCY_KEY_REUSED`; a 21 MB file is `413`; a PDF is `415`; a confirmed design answers `409`. An upload changes neither `version` nor the review.
6. **Review request.** P5 on a DRAFT with a preview sets `reviewRequestedAt` and bumps `version`; without a preview `409`; after any edit `reviewRequestedAt` is gone. QC's `POST /technical-reviews` then sets `technicalReviewPassed` and `reviewedAt`.
7. **Confirmation.** `POST /confirmations` stores the document and `document_checksum` in the snapshot; the snapshot `checksum` covers them; fulfilment verification still passes for a design confirmed after the change and for one confirmed before it.
8. **Fork.** `POST /revisions` of the confirmed design returns a DRAFT at `version 0` whose `GET /document` equals the snapshot's document and whose images resolve.
9. **List.** `GET /designs?status=APPROVED` returns only approved designs of the caller; `?status=NOPE` is `400 UNSUPPORTED_PARAMETER`; another user's design never appears, and is `404` on every endpoint above.

## 11. Assumptions and open questions

| #   | Question or assumption                                                                                                                                                                                         | Storefront behaviour meanwhile                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Q1  | `design_snapshot` requires a non-null `spec` at confirmation. Should P5 (or the confirmation request) refuse a blank `spec`? The storefront always writes the specification before P5.                         | Sends `PUT /specification` first; the mock does not enforce it                                     |
| Q2  | Snapshot `checksum`: extend the manifest hash with the document (the mock), or keep it and add `documentChecksum` as its own field? The first needs the fulfilment verification (`DesignServiceImpl`) updated. | Reads either; the mock extends the hash                                                            |
| Q3  | Customer images in a fork and in a snapshot: does a fork copy the image rows (same ids) so the copied document resolves, and does the snapshot checksum cover the images' checksums?                           | Assumes the fork's images resolve; the mock's fork copies them (same ids)                          |
| Q4  | How the QC reviewer is picked from the pool (P1), and what happens when none is active (`409 CONFLICT` proposed).                                                                                              | Shows the error                                                                                    |
| Q5  | Drafts created through `POST /designs`, and rows older than this change, have no SKU, template or document: `GET /document` is `404`. Should the staff endpoint also take an optional `sku` / `templateCode`?  | Treats such designs as workflow-only; it does not open the editor                                  |
| Q6  | `allowed_file_formats` holds MIME types (seeds changed), or the service maps short names.                                                                                                                      | Maps `PNG`/`JPG`/`JPEG`/`WEBP` itself                                                              |
| Q7  | `POST /designs/mine` answers `200` like `POST /designs`, or `201`.                                                                                                                                             | Accepts any 2xx                                                                                    |
| Q8  | A caller without a customer profile (or a staff caller) on P1: `403 FORBIDDEN` proposed.                                                                                                                       | Shows the error                                                                                    |
| Q9  | Low-DPI policy: does an image below the template's `minDpi` block the review request (as the storefront's preflight Fail does), or only warn and leave it to QC? Who decides the threshold per product?        | Below `minDpi` is a Fail that blocks P5; below `max(minDpi, 300)` (the print file's DPI) a Warning |
| Q10 | 3D preview tone mapping: ACES filmic (current) or three.js Neutral, which keeps print colours closer to their sRGB values. Needs prepress/marketing sign-off on which reads truer to the printed product.      | Neutral since 2026-10-26, with the colour disclaimer next to every preview                         |
| Q11 | The `CutContour` cut path in the print PDF: knockout or overprint? Most RIPs expect the cut line to overprint so it leaves no white hairline in the artwork; the prepress partner must confirm.                | Draws the cut path as a stroked `CutContour` Separation that overprints (since 2026-10-26)         |
