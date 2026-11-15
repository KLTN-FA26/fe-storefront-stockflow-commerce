# Back-office print configuration vs back end (origin/develop 85e6036a)

Read-only check. BE = `be-backoffice-stockflow-commerce` at `origin/develop` (paths below are `origin/develop:<path>:<line>`, lines from `git show`). FO = `stockflow-ui` branch `feat/product-design-print-config`. Requirements = storefront `docs/superpowers/reports/2026-11-13-design-yeu-cau-bo-sung-cho-be.md` Phần B (lines 119-201).
"read" = seen in the file at the line given; "inferred" = concluded from what was read.

Common prefix (BE `CustomizationTemplateController.java:46-56`): `/api/v1/products/{productId}/variants/{variantId}/customization-templates`. FO prefix: `api.ts:21-25`.
Only commit touching these files since the B work: `6e461012` (2026-11-13); nothing in `6e461012..85e6036a` touches `PrintConfigService`, the controller or the DTOs (read: `git log origin/develop -- PrintConfigService.java` ends at 6e461012).

## 1. Headline

1. The BE did B-1 (as the separate PUT, not the one-request save), B-2, B-3, B-4, B-5. It did NOT do B-6 and did NOT do the "one request" note under B-1/B-6.
2. (a) Numbers and file are still TWO requests. (b) The BE does NOT refuse a change of measured numbers without a new file; numbers and file can come apart. Nothing about a checksum is accepted on any request.
3. The FO as written fails against this BE at three places, in this order: every response fails to parse (`model3d` shape), save (multipart POST/PUT to a JSON-only endpoint) answers 415, and the FO has no code path that calls `PUT .../model-file`.

## 2. (a) One request or two, and what the BE holds in between

- Two. `POST` and `PUT` of the template take `@RequestBody CustomizationTemplateRequest` (JSON): `CustomizationTemplateController.java:81-93` (POST), `:95-109` (PUT). No `consumes = multipart`, no `@RequestPart`. The file goes only through `PUT /{templateId}/model-file` with `@RequestParam long version` and `@RequestPart("file")`: `:157-169` (read).
- `CustomizationTemplateRequest` has no file field and no checksum field (`CustomizationTemplateRequest.java:18-70`, read). Its javadoc says it outright: "the file itself is uploaded on its own (PUT .../model-file)" (`:72`).
- State between the two requests (read from `PrintConfigService`):
  - Request 1 (`create` `:132-152` / `update` `:157-173`) commits numbers, areas and surfaces in one transaction. On `update` the version is force-incremented (`:165`).
  - Request 2 (`attachModel` `:247-263`) needs the version request 1 returned (`lockTemplate` `:459-469`, 409 `OPTIMISTIC_LOCK` if it differs), stores the file, bumps the version again.
  - So between them: new numbers + the OLD file (or no file) + the OLD checksum. If request 2 fails: the pair stays torn. For a template that is already ACTIVE, the storefront reads the new numbers with the old file immediately after request 1 (inferred: `activeOfProduct` `:293-314` reads the stored row; there is no draft/pending state). For a first create: an inactive template with numbers and no file; `activate` does not require a file (`:186-189` only checks `getModelParams() == null`).
  - Request 1 and 2 each bump `version`: the FO must re-read the version from the response of request 1 before request 2.

## 3. (b) B-6: can numbers and file come apart? Yes.

- No code compares measured numbers with the stored file. `update` (`PrintConfigService.java:157-173`) calls `describe(template, draft)` and recomputes areas; it never looks at `template.getModelFileKey()` or the checksum. `git grep -i "modelFileChecksum|MODEL_FILE_|PAIR_REQUIRED" origin/develop -- src/main src/test` returns only entity columns/mapper/migration, no rule and no error code (read).
- The request has no `modelFileChecksum`; Jackson default would silently drop an unknown property (inferred: no `FAIL_ON_UNKNOWN_PROPERTIES` setting found in `src/main`), so the FO's `modelFileChecksum` is ignored without an error, which is worse than a 422.
- The response and the storefront reads do not expose the checksum under the requested name. Back-office response: `model3d.fileChecksum` (`CustomizationTemplateResponse.java:43`), not top-level `modelFileChecksum`. Storefront reads (`/customization`, `/designs/{id}/template`): `model3d {url, surfaces}` only, no checksum (diff of 6e461012: `CatalogCustomizationResponse.Model3d(String url, List<Surface> surfaces)`; `TemplateShapes.forReader` emits `{url, surfaces}`); the checksum exists only inside the frozen snapshot JSON (`fileKey`, `fileChecksum`, `surfaces`), which `forReader` strips before it reaches the reader.
- What BE does store: the SHA-256 computed by the BE of the uploaded bytes (`PrintConfigService.java:257` `file.sha256()`), per B-5 fallback. The BE computes it itself; it never compares it with anything the client says. A client therefore cannot even assert "these numbers were measured on this file".

## 4. Requirement items

| Item | Status | Detail |
|---|---|---|
| B-1 PUT model-file | Done, with differences | `PUT .../{templateId}/model-file?version=` multipart part `file`: `Controller.java:157-169`. `GET .../model-file/download-url` -> `ApiResponse<DownloadLink{url, expiresAt}>`: `:179-185` (read). Permission UPDATE / READ. `.glb` signature "glTF" + version 2 checked by first 8 bytes (`ContentTypePolicy` diff: `case "model/gltf-binary"`), 10 MB (`FileCategory.PRINT_MODEL`), scanned and stored like the reference file (`files.prepare(FileCategory.PRINT_MODEL, upload)` `:250`), replaces the old file, version bumped (BaseEntity `@Version` `BaseEntity.java:100`; `saveAndFlush` `:258`). Differences: (1) a browser's `application/octet-stream` / no type with a `.glb` name is accepted as `model/gltf-binary` (`Controller.java:195-203`); (2) a file the scan refuses is **400 VALIDATION_FAILED** (controller javadoc `:149-153` via `@Operation`), not 422 as B-1 asked; empty file is 400 (`ContentTypePolicy.java:43`); (3) 415 `UNSUPPORTED_MEDIA_TYPE`, 413 `PAYLOAD_TOO_LARGE`, 409 `OPTIMISTIC_LOCK` as asked; (4) the one-request variant (note of 2026-11-13) is NOT done. No way to remove a file once attached (no DELETE; inferred from controller). Product must be CUSTOMIZABLE and not discontinued (`:252-254`). |
| B-2 surfaces | Done, with differences | Request: `model3d: { surfaces: [{printAreaCode, meshName}] }`, optional, on POST/PUT (`CustomizationTemplateRequest.java:65-83`). Omitted keeps the stored map (empty on create); `[]` clears (`PrintConfigService.java:147-148, 167-169`). Checks: code in the model's areas, no duplicates, meshName 1-100 -> **422 `PRINT_CONFIG_SURFACES_INVALID`** with `fieldErrors` `model3d.surfaces[i].printAreaCode` / `.meshName` (`:370-403`; `ErrorCode` diff, 422). Difference from B-2: response `model3d` is **always present** and is `{hasFile, fileName, fileChecksum, surfaces}` (`CustomizationTemplateResponse.java:34-47`), not `null` when no file, no `url`, no top-level `modelFileChecksum`. The BE does not require every print area to have a surface; the FO does (stricter, fine). |
| B-3 storefront links | Done | `/catalog/products/{slug}/customization`: per template `model3d {url, surfaces}` or null, signed link, 1 h (`CatalogCustomizationService.modelUrl`, `FileTransfers.sessionViewLink`, `LONGEST_LINK = 1h`); `/designs/{id}/template`: same through `TemplateShapes.forReader(..., this::modelLink)` in `CustomerDesignService` (all from the 6e461012 diff, read). Requires CORS GET on the bucket for the storefront origin (BE javadoc says `infra/aws` configures it; not verified). A link that cannot be signed makes `model3d` null silently. Also added `hasCartonSpec` (A-2). `model` (the numbers) still returned as before. No checksum in these reads (see section 3). |
| B-4 per-version / frozen | Done | The frozen snapshot template JSON now holds `model3d {fileKey, fileChecksum, surfaces}` (`TemplateShapes`), and `PrintTemplateFileReferences` / `DesignFileReferences` keep a replaced model file while a snapshot names it (diff, read). Drafts follow the live template (B39), approved designs read the frozen one (`CustomerDesignService` frozen branch). Not run; inferred from diff. |
| B-5 | Done as the fallback | BE does not read the file; stores SHA-256 (`model_file_checksum`, migration line 13, CHECK `^[0-9a-f]{64}$`). |
| B-6 pair | **Not done** | No checksum input, no refusal of changed numbers, no 409/422 for it, no `modelFileChecksum` on any response (sections 2-3). The one-request save and the "checksum in request 1" interim are both absent. |

Migration `V20261123000100__product_template_model_file.sql` (read in full): adds `model_file_key`, `model_file_name`, `model_file_checksum`, `model_surfaces_json jsonb NOT NULL DEFAULT '[]'` to `product.customization_templates`. CHECK `ck_customization_templates_model_file`: key, name, checksum all null or all set; key starts `print-models/`; checksum is 64 lowercase hex. CHECK on surfaces: JSON array, at most 8 entries. The DB only guarantees file+name+checksum are a set; it knows nothing about the numbers, so B-6 is not enforced there either. The file/checksum triple moves together (good), but the numbers (`model_params`, separate column) do not.

## 5. Call by call

Each call: FO expectation, BE shape, status.

1. **List the variant's templates** (FO `getPrintConfig`).
   - FO: `GET .../customization-templates`, picks `active` else first, `null` if empty (`api.ts:31-39`).
   - BE: `GET` -> `ApiResponse<List<CustomizationTemplateResponse>>` ordered by code, 200 with `[]` when none (`Controller.java:66-72`, `PrintConfigService.java:117-120`). Permission `product-customization-templates:READ`.
   - Status: **differs only in the response shape of `model3d` / `modelFileChecksum`** (below). The "no get-active resource" assumption is right (no such endpoint on the BE).
2. **Get one** (FO has none; it uses the list). BE has `GET /{templateId}` (`:74-79`). Matches by absence.
3. **Create** (FO `savePrintConfig`, no stored).
   - FO: `POST` `multipart/form-data`, part `template` (Blob `application/json`) = `{code, name, minDpi, colorMode, allowedFileFormats, maxFileSizeMb, maxColors, allowedFontCodes, model, printAreas, model3d:{surfaces}, modelFileChecksum}`, part `file` (`model/gltf-binary`) when a file exists (`api.ts:46-83, 93-110`).
   - BE: `POST` JSON body `CustomizationTemplateRequest` (`:81-93`), 201. Fields: `code`(<=50, create only), `name`, `minDpi`, `colorMode`, `allowedFileFormats`, `maxFileSizeMb`, `maxColors`, `allowedFontCodes`, `model` (`ProductModelRequest`: `kind`, `topDiameterMm`, `bottomDiameterMm`, `heightMm`, `rimMm`, `seamMm`, `bandTopOffsetMm`, `bandBottomOffsetMm`, `widthMm`, `gussetMm`, `topFoldMm`, `handle`, `material`), `printAreas[{code,name,safeMarginMm,bleedMm}]`, `version`, `model3d`.
   - Status: **differs, breaking**. A multipart body to a JSON-only handler is `HttpMediaTypeNotSupportedException` -> 415 `UNSUPPORTED_MEDIA_TYPE` (`GlobalExceptionHandler.java:408-441`; inferred, not run). No file can be sent here.
   - Other errors (read): 409 `PRODUCT_NOT_CUSTOMIZABLE`, 409 `PRINT_CONFIG_CODE_TAKEN`, 400 `PRINT_CONFIG_INVALID`, 422 `PRINT_CONFIG_SURFACES_INVALID`, 409 `CONFLICT` for a discontinued product / obsolete variant (`requireWritable` `:471-476`).
4. **Update** (FO, with stored).
   - FO: `PUT .../{templateId}` multipart as above, `version` inside the JSON part (`api.ts:102-107`).
   - BE: `PUT .../{templateId}` JSON, `version` required in the body else 400 `VALIDATION_FAILED` (`Controller.java:95-109`); 409 `OPTIMISTIC_LOCK` on a stale version; version incremented even for a margins-only edit (`PrintConfigService.java:165`). Template code is ignored on update.
   - Status: **differs, breaking** (same 415).
5. **Upload the file in the same request**: **missing on the back end** (section 2). Closest BE call: `PUT .../{templateId}/model-file?version=<long>` multipart part named `file` only (`:157-169`). The FO's part names `template` and `file`: `file` matches, `template` does not exist.
6. **Activate** (FO `activatePrintConfig`): `POST .../{templateId}/activation` body `{version}` (`api.ts:112-125`) vs BE `POST .../activation` body `TemplateVersionRequest` (`Controller.java:111-120`, `:122`). **Matches.** Retires the variant's previously active one in the same transaction (`PrintConfigService.java:191-194`); 400 `PRINT_CONFIG_INVALID` when no model; 409 `PRODUCT_NOT_CUSTOMIZABLE`, `CONFLICT`, `OPTIMISTIC_LOCK`; 404 `PRINT_CONFIG_NOT_FOUND`. Activation does NOT require a file or surfaces (read `:186-189`), so a template can go live with no `.glb`. The FO error list in `api.ts:121-122` is correct.
7. **Deactivate**: `POST .../deactivation` `{version}` vs BE `:122-136` and `PrintConfigService.java:204-214`. **Matches**; not blocked by product state, as the FO comment says (`:205-206` read).
8. **Download the stored file**: FO has none by path; it would use `model3d.url` from the DTO (`schemas.ts:56`, `selectors.ts:13-17`, `save-input.ts:56-57`, `use-print-config-editor.ts:87`). BE: `GET .../{templateId}/model-file/download-url` -> `{url, expiresAt}`, 404 `NOT_FOUND` when no file (`Controller.java:179-185`, `PrintConfigService.java:267-274`). Status: **differs**: the back-office response carries no `url`; the FO must call this endpoint (permission READ) to read the file, and the bucket needs CORS for the back-office origin (inferred; not verified).

### Response shape (every call): FO schema vs BE

| Field | FO (`schemas.ts`) | BE (`CustomizationTemplateResponse.java`) |
|---|---|---|
| `model3d` | `nullable({url: min(1), surfaces[]})` (`:56`) | always present: `{hasFile: bool, fileName: string?, fileChecksum: string?, surfaces[{printAreaCode, meshName}]}` (`:36, :43-47`) |
| `modelFileChecksum` | top-level, nullable (`:57`) | not present; it is `model3d.fileChecksum` |
| `version` | `number` int >= 0 | `long version` (`:33`) |
| `referenceFileName` | nullable | `String referenceFileName` (`:32`) |
| other fields | match: `templateId, productId, variantId, sku, code, name, minDpi, colorMode, allowedFileFormats, maxFileSizeMb, maxColors, allowedFontCodes, active, model, printAreas` (`:15-30`) | |

Consequence (inferred from the schemas): BE always sends a `model3d` object with no `url`; `printConfigDtoSchema.parse` throws on it, so `getPrintConfig`, `savePrintConfig`, `activate` and `deactivate` all fail to parse even for a template with no file. `modelFileChecksum` is always null, so the FO's B-6 guard (`schemas.ts:176-187`) never has a stored checksum and never fires.

Error codes the FO knows (`labels-print-config.ts:31-52`) vs BE: FO invented `MODEL_FILE_PAIR_REQUIRED`, `MODEL_FILE_CHECKSUM_MISMATCH`, `MODEL_FILE_REJECTED`; none exists on the BE. BE has `PRINT_CONFIG_SURFACES_INVALID` (422) which the FO has no message for (falls to `fallback`). BE's `VALIDATION_FAILED` 400 for a rejected/empty file: FO shows `fallback`. 413 and 415 map by status in FO (`errors.ts:10-14`): fine.

## 6. ASSUMPTION markers (print configuration only; the other markers in the repo are unrelated modules)

| Marker | Place | Verdict |
|---|---|---|
| B-2 request takes `model3d: { surfaces }` | `api.ts:62-63` | **Confirmed** (`Request.java:65-69`). |
| B-6 request takes `modelFileChecksum` | `api.ts:64-65` | **Contradicted**: no such field; silently ignored (inferred). |
| B-1/B-6 one multipart request with parts `template` + `file` | `api.ts:70-74` | **Contradicted**: JSON body only; file only through `PUT .../model-file` (`file` part). |
| B-2/B-3 response `model3d {url, surfaces}`, null without file; `modelFileChecksum` | `schemas.ts:33-35, 56-57` | **Contradicted**: `{hasFile, fileName, fileChecksum, surfaces}`, never null, no url; checksum nested as `fileChecksum`. `url` comes from the download-url endpoint. "BE omits nulls" is not checked here (no serializer config read); `fileName`/`fileChecksum` may be absent or null. |
| Codes `MODEL_FILE_PAIR_REQUIRED` / `_CHECKSUM_MISMATCH` / `_REJECTED` | `errors.ts:3-4` | **Contradicted**: not on the BE. Real: 422 `PRINT_CONFIG_SURFACES_INVALID`, 400 `VALIDATION_FAILED` (scan/empty), 415, 413, 409 `OPTIMISTIC_LOCK`. |
| Permission stand-in `PRODUCT_PERMISSIONS.update` | `lifecycle.ts:8-12` | **Still open / now answerable**: BE codes are `product-customization-templates:{VIEW_PAGE,READ,CREATE,UPDATE,DELETE}` (`Controller.java:49-55`, `ProductResources.java:15`; seeded in baseline `V20261111000000__baseline.sql:10041-10045`). `src/constants/permissions.ts` has none (grep "customization" = 0). The controller javadoc says the resource is held by SALES_MANAGER and SYSTEM_ADMIN (`:38-39`, read). If `product-products:UPDATE` is also held by roles that lack the template permission (the FO file's own comment says SALES_STAFF holds product permissions), those users see enabled buttons and get 403 (inferred). |
| Version moves on status change (mock) | `mock-routes-print-configs.ts:77` | **Confirmed**: `saveAndFlush` on a `@Version` entity (`PrintConfigService.java:195-196, 211`; `BaseEntity.java:100`). |
| B-6 mock: `MODEL_FILE_PAIR_REQUIRED` with a file; checksum mismatch 422 | `mock-routes-print-configs.ts:149`, `mock-print-config-file.ts:16` | **Contradicted** (no such rule). |
| B-2 mock: bad mesh -> 422 `VALIDATION_FAILED` | `mock-print-config-parse.ts:5` | **Contradicted in code only**: status 422 is right, code is `PRINT_CONFIG_SURFACES_INVALID`; field error paths `model3d.surfaces[i].printAreaCode/.meshName` (the FO form paths are `surfaces[i]`: needs mapping). |
| Bag face size rule in mock | `mock-print-config-store.ts:109` | Mock-only; BE computes areas itself (`PrintConfigRules`), not checked here. |

## 7. Permissions

- BE checks, per call: READ for list, get, `model-file/download-url`, `reference-file/download-url`; CREATE for POST; UPDATE for PUT template, `model-file`, `reference-file`, activation, deactivation (`Controller.java:68, 75, 88, 99, 113, 124, 160-ish, 179`). Resource code `product-customization-templates` (`ProductResources.java:15`).
- FO `permissions.ts` lacks all five; FO uses `PRODUCT_PERMISSIONS.update` for save/activate/deactivate (`lifecycle.ts:44-60`) and `read` to view. Mismatch to fix: add `CUSTOMIZATION_TEMPLATE_PERMISSIONS` and use READ/CREATE/UPDATE (create vs update gate differ on the BE, FO has one "save" action).

## 8. Does what the back-office saves equal what the storefront reads?

Partly. Read paths: storefront gets `model` numbers, `printAreas` (computed by the BE), `model3d {url, surfaces}` from the same template row, so file and surfaces are the stored ones. What is NOT guaranteed: that the numbers were measured on that file (B-6), and the storefront cannot check (no checksum exposed). Frozen snapshots keep file key + checksum (B-4). Gap windows: between request 1 and request 2 of a save; and any later numbers-only edit.

## 9. What the back-office must change, most breaking first

1. **Response schema** (`schemas.ts:36-58`): accept `model3d {hasFile, fileName, fileChecksum, surfaces}`; derive "has a file" from `hasFile`; take `modelFileChecksum` from `model3d.fileChecksum`; drop `url`. Until this changes, no response parses.
2. **Save**: replace the multipart POST/PUT (`api.ts:75-110`) with: (i) JSON `POST`/`PUT` (body = `printConfigBody` without `modelFileChecksum`; `version` in the body for PUT), (ii) if there is a file, `PUT .../{id}/model-file?version=<version from (i)>` multipart part `file`, content type `model/gltf-binary` or `.glb` name. Keep the SHA-256 of the measured bytes and compare with the response's `model3d.fileChecksum` after (ii); mismatch means the BE stored other bytes.
3. **Two-step failure handling** (`mutations.ts:27-32` says "applies both or neither": no longer true). Decide the order and recovery: after (i) succeeded and (ii) failed the numbers are already stored with the old file; the screen must say so and offer retry of (ii) only (re-read the version first). Today nothing on the BE protects the pair; either the FO guards it (re-measure rule, `schemas.ts:176-187`, but it needs the stored checksum from item 1) or B-6 is asked again as P1 with the BE.
4. **Reading the stored file**: call `GET .../model-file/download-url` when the editor needs the stored `.glb` (`use-print-config-editor.ts:87`, `save-input.ts:56-57`); the link is short-lived; check the bucket CORS for the back-office origin.
5. **Errors**: delete the three `MODEL_FILE_*` codes from `errors.ts` and `labels-print-config.ts:43-46`; add `PRINT_CONFIG_SURFACES_INVALID` (422, field errors `model3d.surfaces[i].*`) and 400 `VALIDATION_FAILED` for a refused/empty file; keep 413/415/409.
6. **Permissions**: add `product-customization-templates:*` to `permissions.ts`; gate view/create/update separately (`lifecycle.ts`).
7. **Mock** (`mock-routes-print-configs.ts`, `mock-print-config-*.ts`, `*.mock-contract.test.ts`, `print-config.save-atomic.mock-contract.test.ts`): change to the real contract (JSON POST/PUT, `PUT model-file`, response shape), so tests no longer pin the assumed atomic multipart save.
8. Optional: show a warning when activating a template without a file or without all surfaces (BE allows it).

Open point for the owner: whether to ask the BE again for B-6 plus the one-request save. Without it, the guarantee that numbers belong to the stored file rests on the back-office screen alone.
