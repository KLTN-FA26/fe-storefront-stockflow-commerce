# Module 12 — API thiết kế mà FE cần nhưng BE (`origin/develop`) chưa có hoặc đang lệch

Ngày: 2026-11-13. Người lập: đọc tĩnh mã nguồn hai repo (không chạy BE, không checkout BE).
Chuẩn nghiệp vụ hai bên cùng theo: `D:\FPTU\docs\docs\ecommerce\12-product-design\README.md` (BR-01 … BR-22, §4.x, §5.x) và `warehouse/01-product-creation` §4.10.

## 1. Tóm tắt

- BE đã kiểm tra: `origin/develop` @ **`df34c338dbe7efbef75e05c2dd1967f576e60182`**, ngày **2026-11-11 14:11:25 +0700** (Merge PR #312). Commit cuối chạm module `design`: `025245c6` (2026-11-08, "approve all goes on whatever fails"); hợp đồng BE viết cho FE: `docs/design-studio-fe-contract.md` (commit `f99e2982`, 2026-11-08).
- Kết luận chung: **BE đã có module thiết kế khá đầy đủ** (thiết kế, bố cục, ảnh, file, gửi duyệt, dự án, thư viện, gửi cả bộ, duyệt, báo giá, snapshot, SKU riêng). Nhưng nó được dựng theo hợp đồng FE cũ (`design-studio-fe-contract.md`, 2026-11-05/08). FE hiện tại (spec 2026-11-09 phần A và 2026-11-12 phần E) đã đổi đường dẫn, dữ liệu và luồng gửi duyệt, nên **gần như mọi endpoint lệch nhau**.
- FE gọi **36 endpoint** (20 thiết kế/ảnh/gửi duyệt/print-config, 11 dự án, 5 thư viện). Phân loại:

| Loại          | Số lượng | Ghi chú                                                                                                                                                                                                        |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Có và khớp    | **4**    | `GET/PUT …/document`, `GET/POST …/assets`                                                                                                                                                                      |
| Có nhưng lệch | **26**   | BE có chức năng tương đương, khác đường dẫn / trường / luồng / mã lỗi                                                                                                                                          |
| Thiếu         | **6**    | `GET /designs/draft-count`, `POST /designs/{id}/clones`, `POST /designs/{id}/preflight-failures`, `POST /design-projects/{id}/preflight-failures`, `POST …/library/images/from-design`, `POST …/library/texts` |

- 7 route `/__mock/*` chỉ dùng cho giả lập, không tính vào 36.
- BE có thêm ~35 endpoint FE chưa gọi (báo giá, snapshot, hàng chờ duyệt, lượt duyệt, template, slot tải thẳng lên kho…): mục 5.
- Bốn vấn đề **xuyên suốt, P0** (mục 3.0): (C1) BE bỏ trường `null` còn zod của FE bắt buộc có khoá; (C2) bảng mã lỗi khác hẳn; (C3) `DesignDto` của FE khác `DesignDraftResponse` của BE; (C4) hình dạng `PREFLIGHT` issue khác. Phần lớn "lệch" ở bảng 2 bắt nguồn từ bốn điểm này.
- Gợi ý cách đóng khoảng cách: vì BE đã dựng và có hợp đồng, nhiều chỗ nên sửa ở FE (adapter) thay vì đòi BE đổi; mỗi mục ở §3 ghi "Hướng" (FE đổi / BE đổi / cần thống nhất). Báo cáo này nêu sự thật, quyết định thuộc nhóm.

## 2. Bảng tổng hợp

Ưu tiên: P0 chặn luồng cơ bản tạo → thiết kế → lưu → gửi duyệt → nhận kết quả; P1 dự án, thư viện, gửi cả bộ, và thao tác thiết kế còn lại trong docs; P2 phần còn lại. Cột "Hành động" là việc còn lại nếu khớp thì "—".
"Ref" là số mục ở §3.

| #   | Method | Path (FE)                                              | Nhóm chức năng                        | Trạng thái ở BE                                                       | Ưu tiên | Ref  |
| --- | ------ | ------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------- | ------- | ---- |
| 1   | GET    | `/designs?status=&page=&size=`                         | Danh sách thiết kế                    | Có nhưng lệch (DTO, sắp xếp theo `createdAt`)                         | P0      | 3.1  |
| 2   | GET    | `/designs/draft-count`                                 | Giới hạn 50 bản nháp (B37)            | **Thiếu**                                                             | P2      | 3.2  |
| 3   | POST   | `/designs`                                             | Tạo bản thiết kế                      | Có nhưng lệch (`POST /designs/mine`, body khác)                       | P0      | 3.3  |
| 4   | GET    | `/designs/{id}`                                        | Một thiết kế                          | Có nhưng lệch (DTO)                                                   | P0      | 3.1  |
| 5   | PATCH  | `/designs/{id}`                                        | Đổi tên                               | Có nhưng lệch (`PUT /designs/{id}/name`)                              | P1      | 3.4  |
| 6   | GET    | `/designs/{id}/history`                                | Lịch sử (§5.3)                        | Có nhưng lệch (phân trang, mới trước, trường khác)                    | P2      | 3.5  |
| 7   | DELETE | `/designs/{id}` `{version}`                            | Xoá nháp (BR-16)                      | Có nhưng lệch (`POST /designs/{id}/archive`)                          | P1      | 3.4  |
| 8   | POST   | `/designs/{id}/revisions`                              | Tạo bản sửa (BR-12)                   | Có nhưng lệch (cùng path; DTO + mã lỗi)                               | P1      | 3.1  |
| 9   | POST   | `/designs/{id}/clones`                                 | Nhân bản sang cỡ khác (ngoài docs)    | **Thiếu**                                                             | P2      | 3.6  |
| 10  | GET    | `/designs/{id}/document`                               | Đọc bố cục                            | **Có và khớp**                                                        | P0      | —    |
| 11  | PUT    | `/designs/{id}/document`                               | Lưu bố cục (BR-11)                    | **Có và khớp**                                                        | P0      | —    |
| 12  | GET    | `/designs/{id}/assets`                                 | Liệt kê ảnh                           | **Có và khớp**                                                        | P0      | —    |
| 13  | POST   | `/designs/{id}/assets`                                 | Tải ảnh (BR-04)                       | **Có và khớp**                                                        | P0      | —    |
| 14  | GET    | `/designs/{id}/assets/{assetId}/url`                   | Link ảnh                              | Có nhưng lệch (`…/download-url`)                                      | P0      | 3.7  |
| 15  | POST   | `/designs/{id}/assets/from-library`                    | Đặt ảnh từ thư viện (BR-18)           | Có nhưng lệch (`…/assets/library`, `{assetId}`)                       | P1      | 3.8  |
| 16  | POST   | `/designs/{id}/submissions`                            | Gửi duyệt (BR-05, BR-07)              | Có nhưng lệch (luồng khác: `artifacts` + `technical-review-requests`) | P0      | 3.9  |
| 17  | POST   | `/designs/{id}/submission-uploads`                     | Đưa bộ file lên trước khi gửi cả bộ   | Có nhưng lệch (tương đương: `POST /designs/{id}/artifacts` ×3)        | P1      | 3.10 |
| 18  | POST   | `/designs/{id}/preflight-failures`                     | Ghi lần preflight trình duyệt từ chối | **Thiếu**                                                             | P2      | 3.11 |
| 19  | GET    | `/designs/{id}/files`                                  | Bộ file đã gửi                        | Có nhưng lệch (`GET …/artifacts` + `…/download-url`)                  | P2      | 3.12 |
| 20  | GET    | `/catalog/products/{slug}/variants/{sku}/print-config` | Cấu hình in của quy cách              | Có nhưng lệch (`GET /catalog/products/{slug}/customization`)          | P0      | 3.13 |
| 21  | GET    | `/design-projects?status=&page=&size=`                 | Danh sách dự án                       | Có nhưng lệch (thiếu `previewUrls`, `openRound`, `updatedAt`)         | P1      | 3.14 |
| 22  | POST   | `/design-projects`                                     | Tạo dự án                             | Có nhưng lệch (response)                                              | P1      | 3.14 |
| 23  | GET    | `/design-projects/{id}`                                | Một dự án                             | Có nhưng lệch (response)                                              | P1      | 3.14 |
| 24  | PATCH  | `/design-projects/{id}`                                | Sửa tên/mô tả                         | Có nhưng lệch (`PUT`, `name` bắt buộc)                                | P1      | 3.15 |
| 25  | POST   | `/design-projects/{id}/archive`                        | Đóng dự án (BR-22)                    | Có nhưng lệch (response, mã lỗi)                                      | P1      | 3.14 |
| 26  | GET    | `/design-projects/{id}/designs`                        | Các bản của dự án                     | Có nhưng lệch (nằm trong `GET /design-projects/{id}` → `designs`)     | P1      | 3.16 |
| 27  | POST   | `/design-projects/{id}/designs`                        | Thêm bản vào dự án (BR-17)            | Có nhưng lệch (trả dự án, mã lỗi)                                     | P1      | 3.17 |
| 28  | DELETE | `/design-projects/{id}/designs/{designId}`             | Gỡ bản                                | Có nhưng lệch (trả dự án, mã lỗi)                                     | P1      | 3.17 |
| 29  | GET    | `/design-projects/{id}/history`                        | Lịch sử dự án (§5.4)                  | Có nhưng lệch (phân trang, mới trước, trường khác)                    | P2      | 3.5  |
| 30  | POST   | `/design-projects/{id}/review-rounds`                  | Gửi duyệt cả bộ (BR-19)               | Có nhưng lệch (body, response, mã lỗi)                                | P1      | 3.18 |
| 31  | POST   | `/design-projects/{id}/preflight-failures`             | Ghi `BATCH_PREFLIGHT_FAILED`          | **Thiếu**                                                             | P2      | 3.11 |
| 32  | GET    | `/design-projects/{id}/library`                        | Thư viện (ảnh + chữ)                  | Có nhưng lệch (`GET …/assets`, chỉ ảnh)                               | P1      | 3.19 |
| 33  | POST   | `/design-projects/{id}/library/images`                 | Tải ảnh vào thư viện                  | Có nhưng lệch (`POST …/assets`)                                       | P1      | 3.19 |
| 34  | POST   | `/design-projects/{id}/library/images/from-design`     | Lưu ảnh của bản vào thư viện          | **Thiếu**                                                             | P2      | 3.20 |
| 35  | POST   | `/design-projects/{id}/library/texts`                  | Lưu mẫu chữ (ngoài docs)              | **Thiếu**                                                             | P2      | 3.20 |
| 36  | DELETE | `/design-projects/{id}/library/{itemId}`               | Xoá mục thư viện (BR-18)              | Có nhưng lệch (`DELETE …/assets/{assetId}` → 204)                     | P1      | 3.19 |

Đếm: khớp = #10, 11, 12, 13 (4). Thiếu = #2, 9, 18, 31, 34, 35 (6). Lệch = 26 còn lại.

Về "khớp": so path, method, request, response của endpoint. Mã lỗi vẫn lệch ở C2 (§3.0), nên "khớp" không có nghĩa FE gọi được mà không đụng gì tới xử lý lỗi.

Auth chung của BE (đọc từ controller): mọi endpoint khách dùng `@RequiresPermission(resource = "design-designs", action = CREATE/READ/UPDATE)`; người gọi phải là tài khoản khách đang hoạt động (`FORBIDDEN` "Only a customer designs on their own account", `CUSTOMER_NOT_ACTIVE` 409). Thiết kế của người khác trả 404. Chưa xác minh việc seed quyền cho vai trò khách (mục 6).

## 3. Chi tiết

### 3.0 Bốn điểm xuyên suốt (P0)

**C1. Trường `null`.** BE bỏ mọi trường `null` khỏi JSON (`ApiResponse` có `@JsonInclude(NON_NULL)`; `application.yml:197 default-property-inclusion: non_null`; `design-studio-fe-contract.md` §1: "test for absence rather than for null"). FE khai ngược lại: "Nullable fields are sent as `null`, never left out" (`schemas.ts` dòng 10–13, `project-schemas.ts` dòng 8–9, `library-schemas.ts` dòng 14) và khai `.nullable()` (bắt buộc có khoá) cho `projectId`, `project`, `sourceSnapshotId`, `lastReturn`, `previewUrl`, `submittedAt`, `approvedAt`, `approval`, `description`, `openRound`, `closedAt`, `note`, `previewUrl` của thư viện, `maxColors`, `allowedFontCodes` của template. Với BE hiện tại các parse này **sẽ lỗi** (khoá thiếu). Hướng: FE đổi sang `.nullish()` / `.optional().transform(v => v ?? null)`; hoặc BE gửi `null` cho các DTO thiết kế. Cần chốt một bên.

**C2. Mã lỗi.** FE đọc `errorCode` (`errors.ts`). Bảng đối chiếu (BE từ `ErrorCode.java`, `design-studio-fe-contract.md` §9):

| FE đang chờ                                                                                                                                | BE trả                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VERSION_CONFLICT` (409)                                                                                                                   | `CONFLICT` (409)                                                                                                                                                                                                               |
| `INVALID_STATE` (409)                                                                                                                      | `DESIGN_NOT_DRAFT` (409); `CONFLICT` cho một số trường hợp khác                                                                                                                                                                |
| `DRAFT_LIMIT`                                                                                                                              | `DESIGN_DRAFT_LIMIT_REACHED` (409)                                                                                                                                                                                             |
| `PRINT_CONFIG_MISSING` (422)                                                                                                               | `PRINT_CONFIG_NOT_FOUND` (404)                                                                                                                                                                                                 |
| `VARIANT_UNAVAILABLE` (422, lúc tạo)                                                                                                       | tạo bản dùng `PRODUCT_NOT_CUSTOMIZABLE` (409) / `PRINT_CONFIG_NOT_FOUND`; `VARIANT_UNAVAILABLE` chỉ là `rule` của preflight lúc gửi                                                                                            |
| `FILE_REJECTED` (422)                                                                                                                      | `UNSUPPORTED_MEDIA_TYPE` (415) cho sai định dạng, `PAYLOAD_TOO_LARGE` (413) cho quá dung lượng (`DesignAssetService` dòng ~106, ~110)                                                                                          |
| `PREFLIGHT_FAILED` (422)                                                                                                                   | `DESIGN_PREFLIGHT_FAILED` (422)                                                                                                                                                                                                |
| `PAYLOAD_TOO_LARGE` (413, document)                                                                                                        | `REQUEST_BODY_TOO_LARGE` (413) cho PUT document (`CustomerDesignService` dòng ~373)                                                                                                                                            |
| `VALIDATION_FAILED` (FE đề nghị 422)                                                                                                       | `VALIDATION_FAILED` (400)                                                                                                                                                                                                      |
| `PROJECT_HAS_PENDING`                                                                                                                      | `DESIGN_PROJECT_HAS_PENDING` (409)                                                                                                                                                                                             |
| `DESIGN_IN_OTHER_PROJECT` (422)                                                                                                            | `DESIGN_IN_ANOTHER_PROJECT` (409)                                                                                                                                                                                              |
| `PROJECT_FULL` (422)                                                                                                                       | `DESIGN_PROJECT_FULL` (409)                                                                                                                                                                                                    |
| `PROJECT_ARCHIVED` (422/409)                                                                                                               | `DESIGN_PROJECT_ARCHIVED` (409)                                                                                                                                                                                                |
| `DESIGN_PENDING` (409)                                                                                                                     | `DESIGN_PENDING_IN_PROJECT` (409)                                                                                                                                                                                              |
| `DESIGN_ARCHIVED` (422)                                                                                                                    | chưa thấy mã riêng; thiết kế ARCHIVED là 404 (`NOT_FOUND`)                                                                                                                                                                     |
| `LIBRARY_FULL` (422)                                                                                                                       | `DESIGN_PROJECT_LIBRARY_FULL` (409)                                                                                                                                                                                            |
| `FILE_RULE` (422, `details.rule` = FORMAT/FILE_SIZE)                                                                                       | đặt ảnh thư viện vào bản: 415 `UNSUPPORTED_MEDIA_TYPE` (contract §3); chưa thấy `details` cùng dạng                                                                                                                            |
| `VERSION_CHANGED`, `SET_TOO_SMALL`, `DESIGN_NOT_IN_PROJECT`, `UPLOAD_INVALID`, `VARIANT_NOT_ELIGIBLE`, `NOT_IN_PROJECT`, `APPROVAL_FAILED` | không có tương ứng 1-1: bản đổi version = `CONFLICT`; dưới 2 bản = `VALIDATION_FAILED` 400; bản không thuộc dự án = `NOT_FOUND`; duyệt lỗi = `DESIGN_PRINT_FILE_INVALID` / `CUSTOMER_SKU_SOURCE_UNAVAILABLE` (409, phía duyệt) |
| `IDEMPOTENCY_KEY_REUSED` (422), `NOT_FOUND` (404)                                                                                          | **khớp**                                                                                                                                                                                                                       |

Hướng: FE đổi bảng mã (rẻ hơn), và chuyển `message` sang theo mã BE. Bản dịch tiếng Việt phía BE nằm ở `i18n/messages_vi.properties`.

**C3. `DesignDto` (FE) và `DesignDraftResponse` (BE).** FE: `schemas.ts` `designDtoSchema` (dòng 33–57). BE: `DesignDraftResponse`.

| FE                                               | BE                                                                                      | Ghi chú                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `id`, `name`, `status`, `version`, `projectId`   | cùng tên                                                                                | khớp                                                                                 |
| `product {slug, title}`                          | `productSlug`, `productId`                                                              | **thiếu `title`**                                                                    |
| `variant {sku, label}`                           | `sku`, `templateCode`                                                                   | **thiếu `label`**                                                                    |
| `project {id, name, status}`                     | `projectId`                                                                             | **thiếu tên và trạng thái dự án** (phải gọi `GET /design-projects/{id}`)             |
| `sourceSnapshotId`                               | `parentSnapshotId`                                                                      | đổi tên                                                                              |
| `lastReturn {reason, returnedAt}`                | `reviewNotes`, `reviewedAt`, `reviewedBy`                                               | BE không nói bản này "đã bị trả" hay chưa; chỉ có ghi chú của lần quyết định cuối    |
| `previewUrl` (URL)                               | `previewArtifactId`, `currentArtifactId` (id)                                           | **thiếu URL**: phải gọi `GET …/artifacts/{id}/download-url` cho từng thẻ (N+1)       |
| `createdAt`                                      | không có (chỉ `updatedAt`)                                                              | **thiếu**                                                                            |
| `submittedAt`                                    | `reviewRequestedAt`                                                                     | đổi tên                                                                              |
| `approvedAt`                                     | `reviewedAt` (khi `APPROVED`)                                                           | đổi tên                                                                              |
| `approval {snapshotId, skuCode, bundleChecksum}` | không có trong DTO; có ở `GET /designs/{id}/snapshot` (`id`, `checksum`, `customerSku`) | **thiếu**: cần cuộc gọi thứ hai, mà FE cần hiển thị SKU riêng ngay trên bản đã duyệt |

Lý do cần: mọi màn thiết kế (danh sách `/design`, thẻ, header studio, kết quả duyệt: bị trả với lý do, đã duyệt kèm SKU) — docs 12 §4.4–§4.5, §5.1, BR-06, BR-09. File FE: `schemas.ts`, `types.ts`. Hướng cần thống nhất: BE bổ sung `product.title`, `variant.label`, `createdAt`, `previewUrl` (link ký sẵn, tránh N+1), `project {id,name,status}`, `approval`; hoặc FE ghép từ nhiều cuộc gọi (đắt cho danh sách).

**C4. Issue của preflight.** FE (`schemas.ts` `preflightIssueSchema`, `reportedPreflightIssueSchema`): `{ruleId, level: "fail"|"note", message, surfaceCode?, elementId?}`, đọc từ `details.issues`. BE (`ErrorCode.DESIGN_PREFLIGHT_FAILED`, `LayoutPreflight.Issue`): `{rule, surfaceCode?, elementId?, message, values?}` — khoá là `rule` (không phải `ruleId`), **không có `level`** (mọi phát hiện đều chặn; B18). Parse hiện tại sẽ lỗi. Tên rule: BE có `EMPTY_DESIGN`, `ELEMENT_INVALID`, `OUTSIDE_PRINT_AREA`, `CROSSES_SAFE_AREA`, `DPI_BELOW_MIN`, `ASSET_INVALID`, `FONT_NOT_ALLOWED`, `VARIANT_UNAVAILABLE`, `CARTON_SPEC_MISSING`, `PRINT_FILE_INVALID`. FE có `NO_CARTON_SPEC` (BE: `CARTON_SPEC_MISSING`), và các rule chỉ chạy ở trình duyệt `ON_SEAM`, `TOO_THIN`, `WHITE_ON_KRAFT`, `TOO_MANY_COLORS`, `CMYK_CONVERSION` (BE không kiểm; không sao vì BE không từ chối bản FE từ chối). Hướng: FE đọc `rule`, gán `level = "fail"` mặc định, đổi tên `CARTON_SPEC_MISSING`.

---

### 3.1 #1 #4 #8 — danh sách, một thiết kế, bản sửa (DTO)

- BE: `GET /api/v1/designs` (`DesignWorkflowController.list`), `GET /{id}`, `POST /{id}/revisions` (`fork`). Cùng path, trả `DesignDraftResponse` (C3). Danh sách: `?status=&page=0&size=` đúng phong bì trang (`items,page,size,totalElements,totalPages,hasNext,hasPrevious`, khớp `pageResponseSchema`). `status=ARCHIVED` hoặc trạng thái lạ → 400 `UNSUPPORTED_PARAMETER` (khớp FE). **Sắp xếp theo `createdAt` giảm dần** (`DesignWorkflowService.list`), FE spec §4.2 muốn mới cập nhật trước (`updatedAt`).
- `POST /revisions`: BE đúng BR-12; lỗi: 409 `CONFLICT` (không phải bản đã duyệt), 409 `DESIGN_DRAFT_LIMIT_REACHED`; "joins the source's project while open and has room" (contract §3). FE: `api-designs.ts` `createRevision`.
- Lý do cần: `/design` danh sách, studio, "Tạo bản sửa" (docs 12 §4.7, BR-12, B37). Ưu tiên: #1, #4 P0, #8 P1.

### 3.2 #2 — `GET /designs/draft-count` — Thiếu (P2)

- BE không có: `git grep -i "draft-count|draftCount|countDrafts"` trên `origin/develop/src/main` trả rỗng. BE chỉ chặn khi tạo (`CustomerDesignRules.MAX_DRAFTS` = 50, 409 `DESIGN_DRAFT_LIMIT_REACHED`).
- FE chờ: `GET /designs/draft-count` → `{ drafts: int ≥0, limit: int >0 }` (`schemas.ts` `draftCountDtoSchema`; `api-designs.ts` `getDraftCount`). Dùng để hiện "N/50 bản nháp" và khoá nút tạo trước khi bị từ chối (docs 12 §4.1, B37). Mã lỗi: không có.
- Cách thay thế không cần BE đổi: đếm từ `GET /designs?status=DRAFT&size=1` → `totalElements`, và `limit` hằng số 50. Vì vậy P2.

### 3.3 #3 — `POST /designs` — lệch (P0)

- BE: `POST /api/v1/designs/mine` body `{productId: UUID, sku, templateCode, name, projectId?}` (`CustomerDesignController.StartRequest`; `name` ≤ 200, `sku` ≤ 64, `templateCode` ≤ 50). 201 `DesignDraftResponse` (bố cục rỗng của template). Lỗi: 409 `DESIGN_DRAFT_LIMIT_REACHED`; với `projectId` 409 `DESIGN_PROJECT_FULL` / `DESIGN_PROJECT_ARCHIVED`; 404 `PRINT_CONFIG_NOT_FOUND`; 409 `PRODUCT_NOT_CUSTOMIZABLE`; 409 `CUSTOMER_NOT_ACTIVE`.
- FE: `POST /designs` body `{productSlug, sku, name, projectId?}` (`schemas.ts` `createDesignInputSchema`; `api-designs.ts` `createDesign`). Mã lỗi chờ: 422 `PRINT_CONFIG_MISSING`, 422 `VARIANT_UNAVAILABLE`, 409 `DRAFT_LIMIT`.
- Khác biệt: (a) đường dẫn `/designs/mine`; (b) BE cần `productId` (UUID) và `templateCode`, FE chỉ có `productSlug` + `sku`. `productId` và `templateCode` lấy được từ `GET /catalog/products/{slug}/customization` (#20: có `productId` và `templates[].code`, `sku`); (c) mã lỗi (C2).
- Lý do cần: bắt đầu thiết kế từ một quy cách (docs 12 §4.1, BR-01, BR-02). Hướng: FE đổi (đã có dữ liệu để lấy `productId`/`templateCode`); hoặc BE nhận `productSlug` và tự chọn template mặc định của `sku`.

### 3.4 #5 #7 — đổi tên, xoá — lệch (P1)

- Đổi tên: FE `PATCH /designs/{id}` `{name, version}`; BE `PUT /api/v1/designs/{id}/name` `{version, name}` (`RenameRequest`, `name` ≤ 200). Lỗi BE: 409 `DESIGN_NOT_DRAFT`, 409 `CONFLICT`.
- Xoá: FE `DELETE /designs/{id}` body `{version}`; BE `POST /api/v1/designs/{id}/archive` `{version}` → `DesignDraftResponse` với `status=ARCHIVED`, đóng yêu cầu báo giá đang mở. DELETE có body dễ bị proxy bỏ nên đường BE hợp lý hơn.
- Lý do: docs 12 §3 (tên 1–200), BR-11, BR-16. File FE: `api-designs.ts` `renameDesign`, `deleteDesign`. Hướng: FE đổi.

### 3.5 #6 #29 — lịch sử — lệch (P2)

- Thiết kế: BE `GET /designs/{id}/history?page&size` → **trang**, **mới trước** (`findByDraftIdOrderByCreatedAtDescIdDesc`), phần tử `{actorId, artifactId, decision, notes, version, at}`. FE (`api-designs.ts` `getDesignHistory`): mảng, **cũ trước**, `{type, at, version, note}`. `decision` ↔ `type`, `notes` ↔ `note`.
- `decision` của BE có thêm `QUOTE_REQUESTED` và, cho dòng cũ của luồng nhân viên, `SENT_TO_CUSTOMER`, `CUSTOMER_CONFIRMED`…; `designEventTypeSchema` của FE là enum chặt (`CREATED … REMOVED_FROM_PROJECT`) nên một giá trị lạ làm hỏng parse cả mảng.
- Dự án: BE `GET /design-projects/{id}/history?page&size` → trang mới trước, `{actorId, event, notes, createdAt}`, không có `version`; có thêm `PROJECT_QUOTE_REQUESTED`. FE: mảng, cũ trước, `{type, at, version, note}` (`project-schemas.ts` `projectEventDtoSchema`; `projectEventTypeSchema` chặt).
- Lý do: docs 12 §5.3, §5.4, BR-13. Hướng: FE đổi (đọc trang, đảo thứ tự, enum mềm).

### 3.6 #9 — `POST /designs/{id}/clones` — Thiếu (P2)

- BE: không có (`git grep -i clone` trong `design/` rỗng). Gần nhất là `POST /designs/{id}/revisions` (chỉ từ bản `APPROVED`, cùng quy cách).
- FE chờ (`api-designs.ts` `cloneDesign`; `schemas.ts` `cloneDesignInputSchema`, `cloneResultDtoSchema`): `POST /designs/{id}/clones` header `Idempotency-Key`, body `{variantSku, document}` (`document` đã co giãn bằng `retargetDocument`); 201 `{design: DesignDto, notInProject: "PROJECT_ARCHIVED"|"PROJECT_FULL"|null}`. Server tạo bản DRAFT cho **variant khác của cùng product**, chép các ảnh tài liệu dùng, vào dự án của bản gốc nếu dự án ACTIVE và còn chỗ (A-E3). Lỗi: 422 `VARIANT_NOT_ELIGIBLE` (variant không cùng product, không Active, hoặc không có cấu hình in); 409 `DRAFT_LIMIT`.
- Lý do: tiện ích "nhân bản sang cỡ khác" của spec phần E §7, **ngoài docs** (spec §11 ghi là mở rộng đề xuất): vẫn tuân BR-01/BR-02 (mỗi bản một quy cách). Chưa có BR riêng. Nếu docs không nhận, bỏ khỏi FE. Ưu tiên P2.

### 3.7 #14 — link ảnh — lệch (P0)

- FE `GET /designs/{id}/assets/{assetId}/url` → `{url, expiresAt}`. BE `GET /api/v1/designs/{designId}/assets/{assetId}/download-url` → `{url, expiresAt}` (`ArtifactDownloadResponse`; `Cache-Control: no-store`). Khác mỗi đường dẫn. FE: `api-document.ts` `getAssetDownloadUrl`. Hướng: FE đổi.

### 3.8 #15 — đặt ảnh từ thư viện — lệch (P1)

- BE: `POST /designs/{designId}/assets/library` `{assetId: UUID}` → 201 `DesignAssetResponse` (cùng dạng ảnh); đặt lại cùng file trả ảnh cũ. Chưa kiểm tra bản có thuộc dự án của file: dựa 404. Từ chối theo template: 415 `UNSUPPORTED_MEDIA_TYPE`.
- FE: `POST /designs/{id}/assets/from-library` `{libraryItemId}` → `DesignAsset`; lỗi 422 `FILE_RULE` với `details = {rule: "FORMAT", contentType, formats[]}` hoặc `{rule: "FILE_SIZE", sizeBytes, maxFileSizeMb}` (`errors.ts` `fileRuleOf`). Dùng ở bảng Ảnh "Thư viện dự án" (BR-18). File FE: `api-library.ts` `placeFromLibrary`.
- Khác: đường dẫn, tên trường, mã/`details` của lỗi. Chưa xác minh `details` BE gửi kèm 415 (mục 6). Hướng: FE đổi path/field; cần BE gửi `details.formats` / `details.maxFileSizeMb` để FE vẫn hiện được lý do.

### 3.9 #16 — gửi duyệt — lệch (P0)

- **BE (hai bước):** (1) dựng 3 file trong trình duyệt, tải từng file `POST /designs/{id}/artifacts?role=&documentChecksum=` (multipart `file`; `role` ∈ `CUSTOMER_PREVIEW`, `PRINT_READY`, `TECHNICAL_SPEC`; `documentChecksum` = SHA-256 hex của bố cục đã lưu; tuỳ chọn `Idempotency-Key`; mỗi lần tải làm đổi `version` của thiết kế); (2) `POST /designs/{id}/technical-review-requests` `{version, quoteRequest?}` → `DesignDraftResponse`. Server **tự chạy preflight trên bố cục đã lưu**, kiểm 3 file khớp `documentChecksum` và phiên bản template, `PRINT_READY` và `TECHNICAL_SPEC` phải là PDF, in kích thước theo `PrintFileGeometry`.
  - Lỗi: 422 `DESIGN_PREFLIGHT_FAILED` (`details.issues`, ghi `PREFLIGHT_FAILED` vào lịch sử, `version` không đổi), 409 `DESIGN_FILES_OUTDATED` (`details.roles`), 409 `DESIGN_NOT_DRAFT`, 409 `CONFLICT` (version cũ), 404 nếu không phải chủ.
- **FE (một bước):** `POST /designs/{id}/submissions` multipart `version`, `preflight` (JSON `{result, issues}` do **trình duyệt** chạy), `checksums` (JSON, SHA-256 từng file), ba phần file theo role (`api-submission.ts` `submitDesign`/`bundleForm`) → `DesignDto`. Lỗi chờ: 422 `PREFLIGHT_FAILED` (`details.issues`), 409 `INVALID_STATE`, 409 `VERSION_CONFLICT`, 422 `FILE_REJECTED` (thiếu phần/checksum lệch).
- Khác: số cuộc gọi, nơi chạy preflight, kiểm checksum (FE gửi `checksums` để server so; BE không nhận `checksums`, tự tính SHA-256 của file nhận được và dựa vào `documentChecksum`), mã lỗi, `quoteRequest` (phần D của FE chưa làm), `PRODUCTION_INSTRUCTION` do BE sinh lúc duyệt.
- Lý do: docs 12 §4.3, BR-05, BR-07, BR-10, BR-11. Hướng: **FE đổi luồng** theo BE (hợp đồng BE §10 "Submitting"): lưu → tải 3 file kèm `documentChecksum` → đọc lại `version` → gửi; không cần BE đổi. Điểm FE nên biết: mỗi lần tải file làm đổi `version`.

### 3.10 #17 — `submission-uploads` — lệch (P1)

- FE `POST /designs/{id}/submission-uploads` (multipart đủ 3 role + `checksums`, `Idempotency-Key`) → `{uploadToken}`; giữ ≤ 24 giờ (A-E4) cho đến khi lượt duyệt dùng (`api-projects.ts` `uploadSubmission`; `project-schemas.ts` `submissionUploadDtoSchema`). Mục đích: đưa file lên trước, rồi **một lệnh** mở lượt (BR-19).
- BE không có khái niệm token tạm: file tải thẳng vào thiết kế bằng `POST /designs/{id}/artifacts` (idempotency theo `userId:role:key`), và `POST /design-projects/{id}/review-rounds` chỉ nhận `{designs:[{id, version}]}`, tự kiểm các file đang gắn trên mỗi bản. Tất-cả-hoặc-không vẫn đúng ở bước mở lượt (`DesignBatchSubmissionService.submit`), không cần staging.
- Hướng: FE đổi (tải artifacts từng bản, rồi đọc lại `version`, rồi `review-rounds`). **Không nên yêu cầu BE làm `submission-uploads`.** P1 vì nằm trong "gửi cả bộ".

### 3.11 #18 #31 — ghi preflight thất bại do trình duyệt báo — Thiếu (P2)

- BE không có endpoint nhận preflight thất bại từ client. BE ghi `PREFLIGHT_FAILED` vào lịch sử bản và `BATCH_PREFLIGHT_FAILED` vào lịch sử dự án **chỉ khi preflight chính nó chạy và thất bại** (`DesignSubmissionService.recordFailure`; `DesignBatchSubmissionService`, `ProjectEventType.BATCH_PREFLIGHT_FAILED`).
- FE chờ: `POST /designs/{id}/preflight-failures` `{version, issues[≥1 có message]}` → 201 event `{type:"PREFLIGHT_FAILED", at, version, note}` (note = các message nối bằng "; "), thiết kế không đổi, 409 `INVALID_STATE` (`api-submission.ts` `recordPreflightFailure`); và `POST /design-projects/{id}/preflight-failures` `{items:[{designId, issues[≥1]}]}` → event dự án `BATCH_PREFLIGHT_FAILED` (`api-projects.ts` `recordSetPreflightFailure`; `project-schemas.ts` `setPreflightFailureInputSchema`).
- Lý do: docs 12 §5.3 `PREFLIGHT_FAILED`, §5.4 `BATCH_PREFLIGHT_FAILED`, BR-13 (ghi lịch sử mọi quyết định). Hướng: nếu FE chuyển sang để BE chạy preflight (3.9) thì hai endpoint này **không cần**, vì BE tự ghi; nếu FE giữ preflight ở trình duyệt thì BE phải thêm. P2.

### 3.12 #19 — file đã gửi — lệch (P2)

- BE: `GET /designs/{designId}/artifacts` → mảng `{artifactId, designId, role, originalName, contentType, sizeBytes, storedAt, checksum, documentChecksum}`; link riêng `GET …/artifacts/{artifactId}/download-url` → `{url, expiresAt}`; `GET …/artifacts/{id}/preflight` → `{passed, findings[{code, detail, blocking}]}`. Role có thêm `PRODUCTION_INSTRUCTION`.
- FE: `GET /designs/{id}/files` → `[{role, name, sizeBytes, sha256, url}]` theo thứ tự role, `[]` trước khi gửi; `url` ký sẵn với `Content-Disposition: attachment; filename=…` (`schemas.ts` `designFileDtoSchema`; `api-submission.ts` `listDesignFiles`). Dùng cho "File đã gửi" (docs 12 §4.5, BR-08).
- Khác: `name`↔`originalName`, `sha256`↔`checksum`, `url` phải gọi thêm, và chưa rõ BE liệt kê "bản hiện tại của mỗi role" hay mọi bản. Hướng: FE đổi (gọi thêm download-url khi bấm); hoặc BE thêm `url`.

### 3.13 #20 — print-config — lệch (P0)

- BE: **không có** `GET /catalog/products/{slug}/variants/{sku}/print-config` (`git grep print-config` trong `src/main` rỗng). Có `GET /api/v1/catalog/products/{slug}/customization` (`StorefrontCatalogController.customization`, không cần đăng nhập, no-store): `{productId, kind, templates[{templateId, code, name, sku, minDpi, colorMode, allowedFileFormats, maxFileSizeMb, maxColors?, allowedFontCodes?, model, printAreas}]}` — một template active cho mỗi variant ACTIVE. Sản phẩm chưa xuất bản: 404; không phải CUSTOMIZABLE: 409 `PRODUCT_NOT_CUSTOMIZABLE`. Dạng `template` (model cup/bag, `printAreas`, `shape`, `uvMapping`) **khớp** `customizationTemplateSchema` của FE (`engine/template/schema.ts`); BE ghi rõ dựng theo `customizationDtoSchema` của studio.
- FE chờ (`schemas.ts` `printConfigDtoSchema`; `api-submission.ts` `getPrintConfig`): `{sku, product:{slug,title,status}, variantStatus: ACTIVE|BLOCKED|OBSOLETE, hasCartonSpec: bool, template, fileRules:{minDpi, formats[], maxFileSizeMb}}`; 404 khi quy cách không có cấu hình in.
- Khác: (a) BE trả mọi variant của product, FE hỏi một variant (lọc theo `templates[].sku` được); (b) **thiếu** `product.title`, `product.status`, `variantStatus`, `hasCartonSpec`; (c) `fileRules` nằm sẵn trong template (`minDpi`, `allowedFileFormats`, `maxFileSizeMb`); (d) variant không có template active đơn giản vắng mặt (FE chuyển thành 404); (e) `maxColors`, `allowedFontCodes` bị bỏ khi null (C1).
- Lý do: nút "Thiết kế" chỉ hiện khi variant Active, sản phẩm Published, có cấu hình in (docs 13 BR-14); bắt đầu thiết kế (docs 12 BR-02); khuôn 2D, vùng in, lề an toàn/tràn (docs warehouse 01 §4.10). `hasCartonSpec` để báo sớm (B25); BE hiện chỉ báo ở preflight lúc gửi (`CARTON_SPEC_MISSING`).
- Hướng: FE đổi sang `/customization` và lọc; hai trường BE thiếu (`product.title`/`status` có ở `GET /catalog/products/{slug}`), `hasCartonSpec` chỉ lộ ra ở preflight — nếu muốn báo sớm cần BE thêm. P0 vì chặn tạo bản.

### 3.14 #21 #22 #23 #25 — dự án (DTO) — lệch (P1)

- BE: `GET /design-projects` → trang `DesignProjectSummaryResponse {id, name, description, status, version, designCount, createdAt, archivedAt}`. `GET/POST …/{id}` và mọi lệnh ghi → `DesignProjectResponse {id, name, description, status, version, createdAt, archivedAt, designs[DesignDraftResponse], assetCount}`. `POST` → 201. Tạo cần `name` ≤ 200, `description` ≤ 2000 (khớp B42). Đóng dự án: 409 `DESIGN_PROJECT_HAS_PENDING`.
- FE (`project-schemas.ts` `designProjectSchema`): `{id, name, description|null, status, version, designCount, previewUrls[≤4], openRound:{id, designIds[], openedAt}|null, createdAt, updatedAt}`.
- Khác/thiếu ở BE: **`previewUrls`** (dải 4 ảnh ở thẻ danh sách; BE chỉ có ảnh ở `GET /{id}.designs[].previewArtifactId`, và danh sách không kèm `designs`), **`openRound`** (khách không có endpoint đọc lượt duyệt đang mở; BE chỉ có `GET /design-review-rounds` cho nhân viên), **`updatedAt`**; `assetCount` (BE) không có ở FE; `designs` inline (BE) nặng hơn FE cần. Sắp xếp "mới trước" theo `createdAt`.
- Lý do: danh sách `/design/projects`, thẻ dự án, dải "N bản đang chờ duyệt cả bộ, gửi lúc …" (spec E §5; docs 12 §4.9, BR-17, BR-20, §5.4). Hướng cần thống nhất: BE thêm `previewUrls`, `openRound` (hoặc `openRoundId`+`designIds`), `updatedAt` vào summary và detail; FE dùng `designs.length` thay `designCount` nếu muốn.

### 3.15 #24 — sửa dự án — lệch (P1)

- BE `PUT /design-projects/{id}` `{version, name (bắt buộc), description?}` (`DescribeRequest`, `name` `@NotBlank`). FE `PATCH /design-projects/{id}` `{version, name?, description?}`, ít nhất một trong hai (`projectUpdateInputSchema`; `api-projects.ts` `updateProject`). BE không cho đổi riêng mô tả bằng cách bỏ `name`. Lỗi 409 `CONFLICT` (FE: `VERSION_CONFLICT`). Hướng: FE luôn gửi cả `name` hiện tại, đổi `PATCH`→`PUT`.

### 3.16 #26 — các bản của dự án — lệch (P1)

- FE `GET /design-projects/{id}/designs` → mảng `DesignDto` (không ARCHIVED, mới cập nhật trước). BE không có endpoint riêng; `designs` nằm trong `GET /design-projects/{id}` (ARCHIVED bị loại, "side by side"). Hướng: FE đọc từ `designs` của dự án; hoặc BE tách để khỏi tải thừa. Lỗi/trường: C3.

### 3.17 #27 #28 — thêm / gỡ bản — lệch (P1)

- BE: `POST /design-projects/{id}/designs` `{designId}` và `DELETE /design-projects/{id}/designs/{designId}` **trả `DesignProjectResponse`** (FE chờ `DesignDto`). Lỗi BE (đều 409): `DESIGN_IN_ANOTHER_PROJECT`, `DESIGN_PROJECT_FULL`, `DESIGN_PROJECT_ARCHIVED`, `DESIGN_PENDING_IN_PROJECT`. FE chờ 422 `DESIGN_IN_OTHER_PROJECT` / `DESIGN_ARCHIVED` / `PROJECT_FULL` / `PROJECT_ARCHIVED`, 409 `DESIGN_PENDING` (`errors.ts`).
- Lý do: BR-17 (một bản tối đa một dự án, bản ARCHIVED không thêm, bản PENDING_REVIEW không gỡ), B42 (20 bản). File FE: `api-projects.ts` `addDesignToProject`, `removeDesignFromProject`. Hướng: FE đổi (đọc `designs` của dự án trả về; map mã lỗi).

### 3.18 #30 — gửi cả bộ — lệch (P1)

- BE: `POST /design-projects/{id}/review-rounds` `{designs: [{id, version}]}` (2 đến 20, không trùng; `@Size(min = 2, max = 20)`) → 201 `{roundId, project: DesignProjectResponse}`. Mỗi bản phải đã có đủ 3 file gắn sẵn (3.9). Lỗi: 422 `DESIGN_BATCH_PREFLIGHT_FAILED` với `details.designs: [{designId, issues? | roles?}]` (mỗi bản `issues` của C4, hoặc `roles` cần dựng lại), 400 `VALIDATION_FAILED` (dưới 2 bản/trùng bản), 409 `DESIGN_PROJECT_ARCHIVED`, 409 `DESIGN_NOT_DRAFT`, 409 `CONFLICT` (version cũ), 404 (bản không thuộc dự án). Ghi `BATCH_PREFLIGHT_FAILED` / `BATCH_SUBMITTED` vào lịch sử dự án.
- FE: `{items: [{designId, version, uploadToken, preflight:{result:"Pass", issues}, checksums}]}` → `reviewRoundSchema {id, projectId, designIds[≥2], openedAt, closedAt|null}`. Lỗi chờ: 409 `VERSION_CHANGED` (nêu tên bản), 422 `PREFLIGHT_FAILED` theo từng bản (`details.designIds`, `details.failures`), 422 `SET_TOO_SMALL`, 409 `PROJECT_ARCHIVED`, 409 `DESIGN_NOT_DRAFT`, `DESIGN_NOT_IN_PROJECT`, `UPLOAD_INVALID` (`errors.ts` `roundRefusalOf`, `roundRefusalSchema`; `api-projects.ts` `openReviewRound`).
- Lý do: docs 12 §4.10, BR-19 (tất cả hoặc không, từ 2 bản `Draft` của dự án `Active`), BR-20. Hướng: FE đổi body và đọc `details.designs`; BE đã đúng BR-19. Lượt duyệt trả về chỉ có `roundId`, không có `designIds`/`openedAt`: FE đọc từ `project.designs` (bản `PENDING_REVIEW`).

### 3.19 #32 #33 #36 — thư viện (ảnh) — lệch (P1)

- BE gọi là `assets` của dự án: `GET /design-projects/{id}/assets` (mảng `DesignProjectAssetResponse {assetId, projectId, originalName, contentType, sizeBytes, checksum, widthPx, heightPx, storedAt}`), `POST /design-projects/{id}/assets` (multipart `file`, 201, rate limit 120/giờ/người, tối đa 30 file; không thấy tham số `Idempotency-Key`), `GET …/assets/{assetId}/download-url`, `DELETE …/assets/{assetId}` → **204 không thân**. Đầy: 409 `DESIGN_PROJECT_LIBRARY_FULL`. Định dạng: PNG, JPEG, WebP (hợp đồng BE §11 ghi rõ không nhận SVG/PDF của B43).
- FE (`library-schemas.ts`): `GET /design-projects/{id}/library` → mảng `LibraryItem` phân theo `kind`: `IMAGE {id, kind, name, asset{originalName, contentType, widthPx, heightPx, sizeBytes, checksum, storedAt}, previewUrl|null, createdAt}` hoặc `TEXT` (xem 3.20). `POST …/library/images` multipart `file` + `Idempotency-Key` → `LibraryImage`; 422 `FILE_REJECTED`, 422 `LIBRARY_FULL`. `DELETE …/library/{itemId}` → trả **mục đã xoá** (`libraryItemSchema`), "các bản đã dùng giữ bản sao" (BR-18).
- Khác: tên path (`library` vs `assets`), hình dạng phần tử (id→`assetId`, `asset` lồng, `kind`, `previewUrl`, `createdAt`), **`previewUrl` phải gọi thêm** (N+1), DELETE 204, mã lỗi, định dạng cho phép.
- Lý do: thư viện tài nguyên dự án (docs 12 §4.9 step 29, BR-18, B43). Hướng: FE đổi sang `/assets` + thêm `kind:"IMAGE"`; BE nên thêm `previewUrl` ký sẵn vào danh sách để tránh N+1.

### 3.20 #34 #35 — lưu ảnh của bản vào thư viện, mẫu chữ — Thiếu (P2)

- **#34 `POST /design-projects/{id}/library/images/from-design`**: BE không có (`grep from-design` rỗng). FE chờ `{designId, assetId}` → 201 `LibraryImage` (server **sao chép** ảnh của bản vào thư viện; tôn trọng giới hạn 30 và định dạng mặc định). Lỗi: 422 `LIBRARY_FULL`, 422/404 khi bản không thuộc dự án (`NOT_IN_PROJECT`). File FE: `api-library.ts` `saveImageToLibrary`; `library-schemas.ts` `saveImageToLibraryInputSchema`. Lý do: tiện ích "Lưu ảnh vào thư viện dự án" trong studio (spec E §6; gần BR-18 nhưng **docs không nêu hướng này**). Cách thay thế phía FE: tải lại file từ bản (qua `…/download-url`) rồi `POST …/assets`. P2.
- **#35 `POST /design-projects/{id}/library/texts`**: BE không có, **và BE không có khái niệm mục chữ trong thư viện** (`DesignProjectAssetJpaEntity` chỉ là file). FE chờ `{text (1–500), style {fontCode, sizePt, color, bold, italic, align, outline?, letterSpacingEm, lineHeight}}` → 201 `LibraryText {id, kind:"TEXT", name, text, style, createdAt}`; 422 `LIBRARY_FULL` (30 mẫu chữ, tính riêng); và `GET …/library` phải trả cả mục `TEXT`; `DELETE …/library/{itemId}` phải xoá được mục `TEXT`. **Ngoài docs** (docs chỉ cho dùng chung ảnh và logo; spec E §11, A-E1). Nếu docs không nhận, bỏ khỏi FE; nếu nhận, cần cả schema DB mới. P2.

---

## 4. API chỉ dùng cho giả lập (BE không cần làm)

Các route này chỉ có trong `src/lib/api/mock-design.ts` (đăng ký dòng 249–264), và `mock-adapter.ts` dòng 77–78 cho phép `/__mock/*` đi vào mock; client gọi ở `src/features/product-design/simulation.ts`. Chúng thay thế phía người duyệt (Quản lý kinh doanh) và công cụ mock:

| Method | Path                                                  | Việc                                              |
| ------ | ----------------------------------------------------- | ------------------------------------------------- |
| POST   | `/__mock/designs/{id}/approve`                        | PENDING_REVIEW → APPROVED (mô phỏng duyệt)        |
| POST   | `/__mock/designs/{id}/return` `{reason}`              | PENDING_REVIEW → DRAFT kèm lý do (BR-06)          |
| POST   | `/__mock/designs/{id}/fail-next-approval` `{enabled}` | lần duyệt kế tiếp của bản này lỗi một lần (BR-09) |
| GET    | `/__mock/design-rounds`                               | các lượt duyệt dự án đang mở                      |
| POST   | `/__mock/design-rounds/{id}/approve-all`              | "Duyệt tất cả" lượt (BR-20)                       |
| POST   | `/__mock/reset`                                       | xoá mock, gieo lại dữ liệu                        |
| GET    | `/__mock/storage`                                     | `{persistent}` (IndexedDB hay bộ nhớ)             |

Tương đương thật phía BE (nhân viên, không thuộc storefront): `POST /api/v1/designs/{id}/reviews` `{version, approved, notes}` (quyền `design-designs:APPROVE`), `GET /designs/review-queue`, `GET /design-review-rounds`, `GET /design-review-rounds/{id}`, `POST /design-review-rounds/{id}/approvals`. Mã lỗi duyệt của BE: 409 `DESIGN_PRINT_FILE_INVALID`, 409 `CUSTOMER_SKU_SOURCE_UNAVAILABLE`. Khi chuyển sang BE thật, bảng "Giả lập" của FE không còn dùng (phía duyệt nằm ở back-office).

## 5. API BE có cho thiết kế mà FE chưa gọi

Khách (storefront):

- `GET /api/v1/designs/{id}/snapshot` — snapshot đã duyệt (file, `document`, `documentChecksum`, `assets`, `customerSku`). **FE cần cho `approval` (C3) nhưng chưa gọi.**
- `GET /api/v1/designs/{id}/template` — template bản đang vẽ (hiện tại cho nháp, đóng băng cho bản đã duyệt).
- `POST /api/v1/designs/{id}/assets/uploads` (slot PUT ký sẵn) và `POST /api/v1/designs/{id}/assets` JSON `{uploadId}` — tải thẳng lên kho đối tượng.
- `POST /api/v1/designs/{id}/artifacts`, `POST …/artifacts/uploads`, `POST …/artifacts` JSON `{uploadId, role, documentChecksum}`, `GET …/artifacts`, `GET …/artifacts/{artifactId}/preflight`, `GET …/artifacts/{artifactId}/download-url` — dùng làm tương đương cho #16, #17, #19.
- `POST /api/v1/designs/{id}/technical-review-requests` — tương đương #16.
- Báo giá (phần D của FE chưa làm): `POST/GET /api/v1/designs/{id}/quote-requests`, `POST/GET /api/v1/design-projects/{id}/quote-requests`.
- `GET /api/v1/design-projects/{id}/assets/{assetId}/download-url` — ảnh xem trước thư viện.

Nhân viên / back-office:

- `GET /api/v1/designs/review-queue`, `POST /api/v1/designs/{id}/reviews`.
- `GET /api/v1/design-review-rounds`, `GET /design-review-rounds/{id}`, `POST /design-review-rounds/{id}/approvals`.
- `GET /api/v1/design-quote-requests`, `POST /design-quote-requests/{requestId}/closure`, `GET /api/v1/design-project-quote-requests`.
- `GET /api/v1/design-snapshots`, `GET /design-snapshots/{snapshotId}/preview`.
- Template (cấu hình in): `GET/POST /api/v1/products/{productId}/variants/{variantId}/customization-templates`, `GET /{templateId}`, `PUT /{templateId}`, `POST /{templateId}/activation`, `/deactivation`, `PUT /{templateId}/reference-file`, `GET /{templateId}/reference-file/download-url`.
- Đơn sản xuất: `GET …/print-files/{designSnapshotId}` (module order, `ProductionOrderFileController`).
- Công khai: `GET /api/v1/catalog/products/{slug}/customization` (dùng thay #20).

## 6. Ghi chú về cách kiểm tra

Lệnh đã chạy (BE, chỉ đọc; không checkout/switch/pull/merge/reset/stash):

- `git fetch origin` (có 9 ref mới), `git log -1 --format='%H %cI %s' origin/develop` → `df34c338…`, 2026-11-11T14:11:25+07:00.
- `git ls-tree -r --name-only origin/develop | grep -i -E 'design|print|dieline|preflight|artwork'` — liệt kê `src/main/java/com/stockflow/design/**` (controller, service, entity, repository, domain), `contracts/Design*.java`, tài liệu `docs/design-studio-fe-contract.md`, `docs/superpowers/plans/2026-11-06-design-studio.md`.
- `git grep -n -E '@(Request|Get|Post|Put|Patch|Delete)Mapping|@PreAuthorize|@Operation|@RequestPart|@RequestHeader' origin/develop -- src/main/java/com/stockflow/design/internal/controller/` để lấy toàn bộ endpoint.
- `git show origin/develop:<path>` cho: `CustomerDesignController`, `DesignWorkflowController`, `DesignAssetController`, `DesignController` (artifacts), `DesignProjectController`, `DesignQuoteRequestController`, `DesignReviewController`, `DesignReviewRoundController`, `DesignSnapshotController`, mọi DTO trong `controller/dto/`, `DesignDocumentRules`, `LayoutPreflight`, `DesignSubmissionService`, `DesignBatchSubmissionService`, `DesignWorkflowService`, `DesignProjectService`, `DesignDecisionType`, `ErrorCode.java`, `StorefrontCatalogController`, `CatalogCustomizationResponse`, `PageResponse`, `application.yml`.
- `git grep -i -E 'draft-count|draftCount|countDrafts'`, `'clone|submission-uploads|uploadToken|from-design|library/texts|preflight-failures|text style|textStyle'` (trong `design/`) và `'print-config|printConfig|/customization'` → xác nhận 6 endpoint "Thiếu".
- FE: đọc `api.ts`, `api-designs.ts`, `api-document.ts`, `api-submission.ts`, `api-projects.ts`, `api-library.ts`, `api-request.ts`, `schemas.ts`, `project-schemas.ts`, `library-schemas.ts`, `errors.ts`, `engine/document/schema.ts`, `engine/template/schema.ts`, `src/lib/api/mock-design.ts`, `mock-adapter.ts` (dòng 60–105), `simulation.ts`; hai spec FE 2026-11-09 §4 và 2026-11-12 §4.
- Docs: `D:\FPTU\docs\docs\ecommerce\12-product-design\README.md` (tiêu đề và §6 BR-01 … BR-22).

Chưa xác minh được (nói thẳng):

1. **Không chạy BE** và không gọi API thật: mọi nhận định về hình dạng/lỗi là từ mã nguồn tĩnh. Chưa chạy test BE (`DesignStudioEndToEndTest`, `DesignProjectIntegrationTest`…).
2. Quyền và vai trò: chưa xác minh `design-designs` (CREATE/READ/UPDATE) và `design-quote-requests` đã được seed cho vai trò khách hàng (cổng thông tin) chưa.
3. Chi tiết `details` của 415/413 khi đặt ảnh thư viện lên bản (3.8) và khi tải ảnh (3.0 C2): chỉ dựa vào hợp đồng BE §3, §9 và `DesignAssetService`; chưa kiểm `details` có `formats`/`maxFileSizeMb`.
4. Mã lỗi khi thêm bản `ARCHIVED` vào dự án (FE chờ `DESIGN_ARCHIVED`): chưa thấy; giả định 404.
5. `GET …/artifacts` liệt kê bản hiện tại của mỗi role hay mọi bản: chưa đọc `DesignArtifactService.list` kỹ.
6. Việc `Idempotency-Key` có áp dụng cho `POST /design-projects/{id}/assets` không (chữ ký controller không có tham số này).
7. Đọc nhanh, không kiểm sâu: các controller của nhân viên (`DesignReviewController`, `DesignReviewRoundController`, `DesignQuoteRequestController`, `DesignSnapshotController`), `CustomizationTemplateController` và phần `ReviewService`; chỉ liệt kê method + path.
8. Chưa đọc: `docs/superpowers/specs/2026-10-25-design-api-be-proposal.md` (spec cũ, đã bị spec 2026-11-09 thay thế về vòng đời/hợp đồng) và `2026-10-26-design-api-yeu-cau-be.docx`; `warehouse/01-product-creation` §4.10 chỉ đối chiếu qua tiêu đề và các dòng liên quan, chưa đọc hết.
9. Các nhận định "FE parse sẽ lỗi" (C1, C4, 3.5) là suy luận từ zod schema và JSON BE; chưa chạy FE với BE thật.
