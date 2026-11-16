# Module 12 — Yêu cầu bổ sung cho BE để storefront chạy 100% trên BE thật (phần A, B, C, E)

Gửi: nhóm BE. Ngày: 2026-11-13. Phạm vi: phần A (nền tảng, vòng đời), B (cấu hình in), C (bộ file xuất), E (dự án thiết kế). **Phần D (báo giá) ngoài phạm vi.**
Chuẩn nghiệp vụ hai bên cùng theo: `ecommerce/12-product-design/README.md` (BR-01 … BR-22, §4.x, §5.x) và `warehouse/01-product-creation/README.md` §4.10.
Nguồn so sánh: `docs/superpowers/reports/2026-11-13-design-api-con-thieu-o-be.md` (báo cáo lệch từng endpoint) và `docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md` (đề xuất phần B). Mọi mục dưới đây đã được đối chiếu lại với mã BE; ghi chú nguồn kiểm tra ở cuối tài liệu.

## 1. Tóm tắt

- **BE đã kiểm tra:** `origin/develop` @ `df34c338dbe7efbef75e05c2dd1967f576e60182` (2026-11-11 14:11 +0700, Merge PR #312). Chỉ đọc (`git show`, `git grep`), không checkout/pull/merge/stash.
- **Quy tắc quyết định.** Báo cáo lệch liệt kê 36 endpoint FE gọi: 4 khớp, 26 lệch, 6 thiếu. Theo quyết định của nhóm, **FE sẽ tự chuyển đổi ở mọi chỗ BE đã có khả năng đó dưới đường dẫn, tên trường, tên mã lỗi hay thứ tự gọi khác**. Tài liệu này vì vậy **chỉ giữ lại những gì chính BE chưa có**: endpoint chưa tồn tại; dữ liệu BE không trả ở đâu cả nên FE không thể lấy bằng một endpoint khác; hành vi BE chưa làm; quy tắc BE trái với docs. Mọi chỗ lệch còn lại nằm ở **Phụ lục** (BE không phải làm gì), mỗi dòng nói FE lấy nó từ đâu.
- **Số lượng "BE phải bổ sung": 16 mục** (thêm B-6 ngày 2026-11-13).

| Phần                           | Số mục | P0    | P1    | P2     |
| ------------------------------ | ------ | ----- | ----- | ------ |
| A — nền tảng, vòng đời         | 3      | 0     | 1     | 2      |
| B — cấu hình in (model `.glb`) | 5      | 0     | 3     | 2      |
| C — bộ file xuất               | 2      | 0     | 0     | 2      |
| E — dự án, thư viện            | 5      | 0     | 0     | 5      |
| **Tổng**                       | **15** | **0** | **4** | **11** |

- **Không có mục P0.** Luồng cơ bản tạo → thiết kế → lưu → gửi duyệt → nhận kết quả chạy được trên BE hiện tại nếu FE chuyển đổi (đường dẫn, DTO, mã lỗi, luồng gửi duyệt 4 bước): xem Phụ lục. Quyền của vai trò `CUSTOMER` (`design-designs:READ/CREATE/UPDATE`) đã được seed trong `V20260903000100__identity_seed_roles_permissions.sql`.
- Cách xếp ưu tiên: **P0** chặn luồng cơ bản; **P1** làm hỏng hoặc làm nghèo một màn hình đã có trong docs của dự án / thư viện / gửi cả bộ; **P2** còn lại (tiện ích FE đề xuất ngoài docs, tối ưu, trường hợp biên, hoặc phần không bắt buộc).
- **Phần B (quyết định 2026-11-13):** model 3D là file `.glb` thật; **không tải file khuôn 2D**, số đo được **đo từ file `.glb`** ở back-office và gửi vào bộ thông số `model` hiện có. BE **không đổi** cách tính vùng in, preflight, đóng dấu PDF; BE chỉ cần nhận, lưu và phát file `.glb` cùng bảng ghép vùng in ↔ mesh (B-1…B-3 và B-6 là P1 vì đây là cách chính để có model 3D và storefront không tự kiểm file; B-4, B-5 là P2). Kiểu "File tuỳ chỉnh" có file khuôn SVG để sau.
- Ba mục thuộc về dữ liệu FE ban đầu nghĩ BE phải thêm nhưng thực tế FE lấy được từ endpoint khác nên **chuyển sang Phụ lục**: số bản nháp (B37, `GET /designs?status=DRAFT&size=1` → `totalElements`), `createdAt` (không màn hình nào hiển thị), và dữ liệu thẻ dự án `openRound` / `updatedAt` / `previewUrls` (suy ra từ `designs` của dự án).
- Cuối tài liệu có **8 câu hỏi cần BE xác nhận** (mục 4).

## 2. Bảng tổng hợp các mục BE phải bổ sung

| Id  | Phần | Việc BE phải làm                                                                                                                                | Ưu tiên | Docs                           |
| --- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------ |
| A-1 | A    | Thêm `previewUrl`, `variantName`, `productName` vào `DesignDraftResponse` (danh sách, chi tiết, và `designs[]` của dự án)                       | P1      | 12 §4.2 b.8, §4.9 b.30         |
| A-2 | A    | Thêm `hasCartonSpec` vào mỗi template của `GET /catalog/products/{slug}/customization`                                                          | P2      | 12 BR-05, B25                  |
| A-3 | A    | `POST /api/v1/designs/{id}/preflight-failures`: ghi `PREFLIGHT_FAILED` khi trình duyệt từ chối                                                  | P2      | 12 §5.3, BR-13                 |
| B-1 | B    | `PUT …/customization-templates/{templateId}/model-file`: tải, quét, lưu file model `.glb` (và link tải cho back-office)                         | P1      | 01 §4.10, BR-18, BR-21         |
| B-2 | B    | Trường `model3d.surfaces` (vùng in ↔ tên mesh) trong request / response của template                                                            | P1      | 01 §4.10                       |
| B-3 | B    | Phát `model3d { url, surfaces }` qua `/customization` và `/designs/{id}/template`; `url` tải được từ storefront (CORS); `null` khi chưa có file | P1      | 01 §4.10 b.3, B36              |
| B-4 | B    | Giữ `.glb` theo phiên bản template; bản đã duyệt giữ model lúc duyệt                                                                            | P2      | 12 BR-08, B39                  |
| B-5 | B    | (Không bắt buộc) BE tự kiểm số đo trong `model` khớp file `.glb`, hoặc lưu checksum của file                                                    | P2      | 01 §4.10                       |
| B-6 | B    | Số đo của `model` và file `.glb` lưu thành một cặp: không nhận sửa số đo nếu không kèm file mới hoặc checksum trùng; trả `modelFileChecksum`    | P1      | 01 §4.10                       |
| C-1 | C    | Nhúng output intent ICC vào PRINT_READY đã đóng dấu PDF/X-4                                                                                     | P2      | 12 §3 (bảng vai trò file), B35 |
| C-2 | C    | Kiểm checksum file lưu trữ trước khi cấp link tải cho khách (bản đã duyệt)                                                                      | P2      | 12 §3 (Link tải file), BR-10   |
| E-1 | E    | Mẫu chữ trong thư viện dự án (mở rộng FE đề xuất, ngoài docs)                                                                                   | P2      | ngoài docs (spec E A-E1)       |
| E-2 | E    | Lưu ảnh của bản thiết kế vào thư viện (mở rộng FE đề xuất, ngoài docs)                                                                          | P2      | gần BR-18, ngoài docs          |
| E-3 | E    | Nhân bản bản thiết kế sang quy cách khác của cùng sản phẩm (mở rộng FE đề xuất, ngoài docs)                                                     | P2      | BR-01, BR-02; ngoài docs       |
| E-4 | E    | `POST /api/v1/design-projects/{id}/preflight-failures`: ghi `BATCH_PREFLIGHT_FAILED` khi trình duyệt từ chối cả bộ                              | P2      | 12 §5.4, BR-13, BR-19          |
| E-5 | E    | `Idempotency-Key` cho `POST /api/v1/design-projects/{id}/assets`                                                                                | P2      | 12 BR-18                       |

---

## 3. Chi tiết

### Phần A — nền tảng và vòng đời (docs 12 §4.1–§4.7, §5.1–§5.3)

#### A-1. Thêm `previewUrl`, `variantName`, `productName` vào `DesignDraftResponse` — P1

**Thêm gì.** Ba trường vào `DesignDraftResponse` (`DraftViews.view`, `DesignWorkflowWebMapper`), dùng chung cho `GET /designs`, `GET /designs/{id}`, mọi lệnh ghi trả thiết kế, và `designs[]` trong `DesignProjectResponse`:

| Trường        | Kiểu                                   | Nguồn gợi ý                                                                   | Ghi chú                                                                                       |
| ------------- | -------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `previewUrl`  | string, vắng khi chưa có ảnh xem trước | `FileTransfers.viewLink` của `previewArtifactId` (CUSTOMER_PREVIEW hiện tại)  | link inline, ký cục bộ, không kiểm tồn tại, không ghi audit; TTL ngắn như các `viewLink` khác |
| `variantName` | string                                 | `variants.name` của `variantId`                                               | tên quy cách hiển thị cho khách                                                               |
| `productName` | string                                 | `ProductSummary.name` (`DraftViews` đã đọc `ProductSummary` cho mỗi sản phẩm) | để vẫn có tên khi sản phẩm không còn xuất bản (`GET /catalog/products/{slug}` trả 404)        |

**Request/Response.** Không đổi request. Response thêm ba trường trên. FE: `src/features/product-design/schemas.ts` (`designDtoSchema`: `previewUrl`, `product.title`, `variant.label`), `selectors.ts:49` (dòng phụ của thẻ "sản phẩm · quy cách"), `components/add-designs-dialog.tsx:45`, `components/project-design-card.tsx`, `components/design-card.tsx`.

**Lỗi.** Không có lỗi mới.

**Docs.** 12 §4.2 b.8 (khách xem lại mọi bản thiết kế), §4.9 b.30 và bảng Output "Dự án thiết kế" ("danh sách bản thiết kế kèm trạng thái và ảnh xem trước"): các màn hình này phải nhận ra từng bản và hiện ảnh xem trước cạnh nhau.

**Vì sao FE không tự làm được.**

- `previewUrl`: BE chỉ có `previewArtifactId`. Link duy nhất cho artifact là `GET /designs/{id}/artifacts/{artifactId}/download-url`, mà `DesignArtifactService.downloadLink` gọi `FileTransfers.downloadLink` (có lệnh HEAD kiểm tồn tại, `Content-Disposition: attachment`, ghi audit `EXPORT`, `no-store`). Một trang 20 thẻ hay màn hình dự án 20 bản sẽ sinh 20 lệnh HEAD và 20 bản ghi audit xuất file chỉ để vẽ thumbnail. Chính javadoc `FileTransfers.viewLink` nói lý do: "a list of twenty photos must not cost twenty round trips". BE đã dùng `viewLink` cho ảnh thiết kế và thư viện; chỉ ảnh xem trước của artifact chưa có.
- `variantName`: không endpoint khách nào trả tên quy cách. `CatalogProductResponse.VariantResponse` chỉ có `sku`; template trong `/customization` có `name` nhưng đó là tên khuôn ("Ly giấy 12oz - thân ly" trong ví dụ của `CustomizationTemplateRequest`) và biến mất khi quy cách bị khoá. Cột `variants.name` tồn tại ở `VariantJpaEntity` nhưng không được lộ ra (xem câu hỏi Q-4).
- `productName`: FE lấy được `title` từ `GET /catalog/products/{slug}` khi sản phẩm còn xuất bản; thêm `productName` để bản thiết kế của sản phẩm đã ngừng vẫn có tên.

**Ưu tiên P1** vì màn hình dự án "cạnh nhau" (§4.9 b.30) cần ảnh xem trước. Nếu chưa có, FE tạm hiện SKU và ô ảnh trống; luồng không bị chặn.

#### A-2. Thêm `hasCartonSpec` vào template của `/customization` — P2

**Thêm gì.** Mỗi phần tử của `templates[]` trong `GET /api/v1/catalog/products/{slug}/customization` (`CatalogCustomizationResponse.Template`) có thêm `hasCartonSpec: boolean`, tính đúng như `DesignSubmissionService.hasCartonSpec(sku)` (có đơn vị đóng gói đang hoạt động, không phải đơn vị gốc, hệ số > 1).

**Request/Response.** Response thêm một trường boolean, luôn có. FE: `schemas.ts` `printConfigDtoSchema.hasCartonSpec`; `engine/preflight/types.ts` `PreflightVariant.hasCartonSpec`; `engine/preflight/rules/variant.ts` (rule `NO_CARTON_SPEC`).

**Lỗi.** Không có.

**Docs.** 12 BR-05 và edge case "Quy cách chưa có quy cách thùng khi khách gửi duyệt"; 01 BR-03; open-questions B25 (đã chốt 2026-11-05).

**Vì sao FE không tự làm được.** Quy cách thùng không xuất hiện ở endpoint công khai hay endpoint khách nào (`git grep hasCartonSpec` chỉ thấy hàm private của `DesignSubmissionService`). BE chỉ báo `CARTON_SPEC_MISSING` lúc gửi duyệt, tức sau khi khách đã dựng và tải ba file. Studio muốn báo ngay khi mở bản thiết kế. Không có trường này luồng vẫn chạy: FE bỏ rule phía trình duyệt và hiện lỗi từ `DESIGN_PREFLIGHT_FAILED`. Vì vậy P2.

#### A-3. `POST /api/v1/designs/{id}/preflight-failures` — ghi lần gửi duyệt bị trình duyệt từ chối — P2

**Thêm gì.** Endpoint cho chủ bản thiết kế ghi một dòng `PREFLIGHT_FAILED` vào lịch sử khi preflight **phía studio** từ chối, không đổi bản thiết kế. BE đã có sẵn thao tác này cho preflight của chính nó (`DesignSubmissionService.recordFailure`, version không đổi).

**Request** (`api-submission.ts` `recordPreflightFailure`, `schemas.ts` `reportedPreflightIssueSchema`):

```json
{
  "version": 12,
  "issues": [
    { "rule": "OUTSIDE_PRINT_AREA", "surfaceCode": "BODY", "elementId": "el-3", "message": "..." }
  ]
}
```

`issues` từ 1 đến 50 phần tử; `rule` không rỗng (tên rule theo BE, FE sẽ đổi `ruleId` thành `rule`); `message` có thể dài tối đa 500 ký tự.

**Response.** 201, một phần tử lịch sử cùng dạng `DesignDecisionResponse`: `{actorId, artifactId?, decision: "PREFLIGHT_FAILED", notes, version, at}`. Thiết kế giữ nguyên trạng thái và version.

**Lỗi.** 404 nếu không phải chủ hoặc bản đã `ARCHIVED`; 409 `DESIGN_NOT_DRAFT`; 409 `CONFLICT` nếu `version` cũ; 400 `VALIDATION_FAILED` nếu `issues` rỗng/quá nhiều/quá dài; 429 `RATE_LIMITED`.

**Gợi ý an toàn.** Nội dung do trình duyệt tự khai, không tin được: chỉ ghi cho chủ, chỉ khi `DRAFT`, cắt `notes` ở `NOTES_MAX` (4000) như `summary(issues)` hiện có, và đặt giới hạn tốc độ để không ai nhồi lịch sử.

**Docs.** 12 §5.3 `PREFLIGHT_FAILED` ("Gửi duyệt nhưng preflight không đạt, ghi danh sách lỗi"), BR-13 (mọi quyết định ghi lịch sử).

**Vì sao FE không tự làm được.** BE tự ghi `PREFLIGHT_FAILED` khi preflight của nó thất bại, nhưng studio kiểm những thứ BE không kiểm được: độ lấn của chữ theo số đo phông (BE ghi rõ "no font metrics", `design-studio-fe-contract.md` §8) và rule `ON_SEAM`. Khi trình duyệt từ chối mà BE sẽ cho qua, BE không thấy gì nên lịch sử thiếu dòng này. FE cũng không thể ép BE ghi bằng cách gọi `technical-review-requests`: nếu preflight của BE đạt và ba file còn khớp, bản sẽ bị gửi duyệt thật. P2 vì docs vẫn được thoả cho phần BE tự chạy.

---

### Phần B — cấu hình in (docs 01 §4.10, BR-18, BR-21, B36)

**Quyết định của nhóm FE (2026-11-13), xem `docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md`:** model 3D là **file `.glb` thật** (dựng bằng Blender); **không tải file khuôn 2D riêng**. Công cụ ở back-office **đo ngay trên file `.glb`** (bán kính vòng trên / vòng dưới và chiều cao phần in của ly; rộng × cao từng mặt của túi) và điền các số đó vào đúng bộ thông số `model` mà BE đang nhận (`parametric-cup`, `parametric-bag`). Người khai báo không gõ số đo. Công cụ đó cũng tự kiểm file trước khi gửi lên (đúng hình nón tròn xoay / mặt phẳng, đúng UV, đối chiếu số đo với thông số nhà sản xuất, xem thử ô lưới): **bốn bước kiểm này chạy trên trình duyệt, BE không phải làm gì cho chúng**. Lề an toàn, lề tràn, mép dán của ly và ràng buộc file ảnh được điền sẵn mặc định ở back-office rồi gửi lên bằng các trường BE đã có.

**BE không phải đổi:** cách tính vùng in từ `model` (`TemplateShapes`, `PrintConfigRules`), preflight máy chủ, hình học file in, đóng dấu PDF/X-4. Tất cả tiếp tục chạy trên bộ thông số như hôm nay; chỉ khác là số đo do máy đọc từ file.

**BE phải bổ sung:** nhận, lưu và phát file `.glb` đi kèm template, cùng bảng ghép "vùng in ↔ tên mesh". Tên trường dưới đây là đề xuất, cần BE và FE chốt trước khi làm. Kiểu "File tuỳ chỉnh" với file khuôn SVG (hướng B) **để sau**, không nằm trong tài liệu này.

#### B-1. Tải, quét và lưu file model `.glb` của template — P1

**Thêm gì.** `PUT /api/v1/products/{productId}/variants/{variantId}/customization-templates/{templateId}/model-file?version=` (multipart `file`), cùng kiểu với `PUT …/reference-file` đã có. Quyền `customization-templates:UPDATE`.

- Nhận: `.glb` (glTF 2.0 nhị phân: 4 byte đầu `glTF`, phiên bản 2), tối đa 10 MB. Quét virus như file tham khảo (BR-18).
- Thay file đã gắn trước đó. Template đang `Active` và đã có bản thiết kế dùng: tăng `version` như các thay đổi cấu hình in khác (B39).
- Trả `CustomizationTemplateResponse` có thêm `model3d` (B-2).
- `GET …/{templateId}/model-file/download-url`: link ngắn hạn cho back-office (như `reference-file/download-url`).
- **Sửa ngày 2026-11-13 (xem B-6):** endpoint tách riêng như trên khiến một lần lưu thành hai request (số đo trước, file sau). Cách nên làm là nhận file **cùng một request** với số đo của template; endpoint riêng này chỉ là phương án tạm nếu BE chưa làm được.

**Lỗi.** 415 sai định dạng; 413 quá dung lượng; 422 file không qua quét; 409 `OPTIMISTIC_LOCK` khi `version` cũ.

**Docs.** 01 §4.10 (model 3D là một phần cấu hình in), BR-18, BR-21.

**Vì sao FE cần.** Không có nơi lưu `.glb` thì studio không hiện được model thật; đây là quyết định chính của phần B.

#### B-2. Bảng ghép vùng in ↔ tên mesh trong template — P1

**Thêm gì.** `CustomizationTemplateRequest` và `CustomizationTemplateResponse` thêm trường không bắt buộc:

```json
"model3d": {
  "surfaces": [{ "printAreaCode": "BODY", "meshName": "print:BODY" }]
}
```

- `printAreaCode` phải là một vùng in mà `model` của template có (`BODY`; hoặc `FRONT`, `BACK`, `LEFT`, `RIGHT`); mỗi mã tối đa một dòng; `meshName` 1–100 ký tự.
- Back-office đọc tên mesh từ chính file `.glb` rồi gửi lên; BE không cần đọc bên trong file (xem B-5).
- Chưa gắn file thì `model3d` là `null` (không dùng cờ `hasFile` riêng). Đã gắn thì response trả `model3d { url, surfaces }` cùng `modelFileChecksum` (B-6).

**Lỗi.** 422 kèm lỗi theo trường khi `printAreaCode` không thuộc `model`, hoặc trùng.

**Docs.** 01 §4.10; hình dạng khớp `gltfModelSchema.surfaces` của FE (`src/features/product-design/engine/template/schema.ts`).

**Vì sao FE cần.** Studio vẽ mỗi vùng in thành một ảnh và phải biết dán lên mesh nào.

#### B-3. Phát link `.glb` và bảng ghép cho storefront — P1

**Thêm gì.** Mỗi template trong `GET /api/v1/catalog/products/{slug}/customization` và trong `GET /api/v1/designs/{id}/template` có thêm:

```json
"model3d": {
  "url": "https://…/model.glb",
  "surfaces": [{ "printAreaCode": "BODY", "meshName": "print:BODY" }]
}
```

- `model3d` là `null` (hoặc vắng) khi template chưa có file: storefront khi đó chỉ hiện 2D, hoặc mẫu 3D dựng từ số đo như hôm nay (B36). Thiết kế và gửi duyệt vẫn chạy.
- `url` phải **tải được bằng trình duyệt từ origin của storefront** (CORS `GET`), đủ lâu để lưu đệm trong một phiên làm việc (link công khai, hoặc link có chữ ký hạn ≥ 1 giờ). `model` (bộ số đo) vẫn được trả như hôm nay.

**Docs.** 01 §4.10 b.3; giả định B36.

**Vì sao FE cần.** Trình xem 3D của studio và ảnh xem trước trong bộ file gửi duyệt nạp model từ link này.

#### B-4. Giữ `.glb` theo phiên bản template; bản đã duyệt không đổi hình — P2

**Thêm gì.** File `.glb` thuộc về **phiên bản** template. `GET /designs/{id}/template` trả `model3d` của đúng phiên bản mà bản thiết kế đang dùng; với bản `APPROVED`, là phiên bản đã đóng băng trong snapshot. Thay file trên template không làm đổi model của bản đã duyệt.

**Docs.** 12 BR-08 (snapshot bất biến); B39.

**Vì sao FE cần.** Khách mở lại bản đã duyệt phải thấy đúng model lúc duyệt.

#### B-5. (Không bắt buộc) BE tự kiểm số đo khớp file `.glb` — P2

**Thêm gì.** Khi nhận `model` kèm `.glb`, BE đọc các mesh `print:*` và kiểm số đo trong `model` khớp hình trong file (sai số ≤ 0,5 mm); lệch thì 422. Nếu không làm: lưu `modelFileChecksum` (SHA-256 của file dùng để đo) cạnh `model` để biết bộ số đo đến từ file nào.

**Vì sao.** Ràng buộc "một nguồn duy nhất" hiện dựa vào công cụ back-office; mục này để BE tự bảo đảm. Back-office là người dùng nội bộ có quyền, nên không chặn.

#### B-6. Số đo và file `.glb` lưu thành một cặp — P1 (thêm ngày 2026-11-13)

**Thêm gì.** Khi template đã có file `.glb`, BE không nhận yêu cầu sửa các số đo của `model` (đường kính miệng, đường kính đáy, chiều cao, khoảng cách dải in tới miệng và đáy; rộng, hông, cao của túi) nếu yêu cầu đó không kèm file mới, hoặc không kèm `modelFileChecksum` trùng với file đang lưu (nghĩa là back-office đã đo lại trên chính file đó). Không đạt thì 409 hoặc 422. Response của template và của `/designs/{id}/template` trả `modelFileChecksum`. Các trường không đo từ file (mép dán, lề an toàn, lề tràn, chất liệu, ràng buộc file ảnh) sửa tự do như hôm nay.

**Vì sao FE cần.** Theo quyết định ngày 2026-11-13, việc đo và kiểm file model chỉ chạy ở back-office lúc upload; storefront không còn so file với bộ số đo. Nếu số đo bị sửa mà file không đổi, storefront vẫn dán hình lên model theo số đo mới: khách thấy hình ở một chỗ trên 3D, file in ra ở chỗ khác, và không có gì báo lỗi. Chỉ BE chặn được việc hai thứ này lệch nhau sau khi đã lưu. Mục này thay cho B-5 về mức ưu tiên: B-5 (BE tự đọc file) vẫn không bắt buộc, còn giữ cặp bằng checksum thì bắt buộc.

**Lưu số đo và file trong một lần.** Theo hợp đồng hiện có, lưu cấu hình là hai request: `POST`/`PUT` template (JSON, có số đo), rồi `PUT …/model-file` (file). Giữa hai request, BE đang giữ số đo mới với file cũ, và nếu request thứ hai lỗi thì cặp bị lệch. Đề nghị BE nhận template và file trong **một request multipart** (hoặc một giao dịch: số đo mới chỉ có hiệu lực khi file tương ứng đã tới và checksum khớp). Trong lúc chờ, back-office gửi kèm ở request đầu checksum của file sắp tải lên; BE đối chiếu khi file tới và trả 422 nếu không khớp.

### Phần C — bộ file xuất (docs 12 §3, §4.5, BR-08–BR-10, B35)

**Đã đối chiếu, không cần BE làm:** sau khi duyệt, `GET /designs/{id}/artifacts` **có** liệt kê `PRINT_READY` đã đóng dấu và `PRODUCTION_INSTRUCTION`, mỗi file kèm `checksum` (SHA-256 của file), `documentChecksum`, `sizeBytes`, `role` (`DesignArtifactResponse`; `DesignReviewService.approve` lưu hai artifact mới rồi gắn vào `currentArtifacts`). Danh sách trả **mọi lần tải**, mới trước (`findByDraftIdOrderByStoredAtDescIdDesc`). `GET /designs/{id}/snapshot` trả đúng bốn file đóng băng cùng `checksum` từng file và `checksum` cả bộ. FE tự chọn (Phụ lục F-21).

#### C-1. Nhúng output intent ICC vào PRINT_READY — P2

**Hiện trạng.** `PrintReadyStamp` đóng dấu TrimBox, BleedBox, `GTS_PDFXVersion = PDF/X-4`, `Trapped = False`, **nhưng không nhúng output intent**: file được nhận dạng là PDF/X-4 nhưng không tuân chuẩn. BE tự khai điều này (javadoc `PrintReadyStamp`; `design-studio-fe-contract.md` §11; `messages_vi.properties` `design.instruction.pdfx`). Lý do: chưa có profile ICC của nhà in (open-questions B35).

**Thêm gì.** Khi nhà in chốt profile: nhúng `OutputIntent` (GTS_PDFX, `OutputConditionIdentifier`, ICC profile) vào bản PRINT_READY được đóng dấu lúc duyệt, rồi bỏ câu "chưa đạt chuẩn" trong `ProductionInstructionSheet`; nên có kiểm tuân chuẩn (veraPDF) vì build hiện chưa có.

**Lỗi.** Giữ `DESIGN_PRINT_FILE_INVALID` (409) như hiện nay khi không đóng dấu được.

**Docs.** 12 §3 (bảng vai trò file: `PRINT_READY` là "File in **PDF/X** theo khuôn"), B35 (giả định PDF/X-4).

**Vì sao FE không tự làm được.** Đóng dấu và chốt file in là việc của BE lúc duyệt (BR-09). Phụ thuộc quyết định nghiệp vụ B35 và cách xử lý màu (Q-1) nên đặt P2.

#### C-2. Kiểm checksum trước khi cấp link tải file đã duyệt cho khách — P2

**Hiện trạng.** `DesignServiceImpl.fulfillmentDownload` và `DesignSnapshotQueryService.preview` (back-office) đã kiểm file lưu trữ khớp checksum đã chốt trước khi cấp link, trả 409 `CONFLICT` nếu lệch. Nhưng đường **khách** `GET /designs/{id}/artifacts/{artifactId}/download-url` (`DesignArtifactService.downloadLink`) chỉ ký link, không kiểm gì, kể cả khi file thuộc snapshot đã duyệt.

**Thêm gì.** Khi `artifactId` thuộc manifest của snapshot của bản đó (bản `APPROVED`): kiểm checksum bằng đúng logic `fulfillmentDownload` (manifest còn cộng ra checksum cả bộ, và SHA-256 lưu của file khớp) rồi mới cấp link; lệch thì từ chối. Không đổi request/response; link vẫn `{url, expiresAt}`. Có thể dùng lại mã `PRINT_FILE_MISMATCH` (409) hoặc `CONFLICT` hiện có.

**Docs.** 12 §3 Output "Link tải file" (Khách, Sale, Quản lý kinh doanh… "file trong snapshot chỉ cấp khi checksum còn khớp"); BR-10; edge case "File trong kho lưu trữ bị thay / hỏng sau khi duyệt: không cấp link tải".

**Vì sao FE không tự làm được.** Đây là bảo đảm toàn vẹn phía máy chủ; FE chỉ có thể tự so `sha256` của file đã tải về, mà không thay được việc BE từ chối cấp link.

**Ghi chú.** Việc BE kiểm khi **gắn** snapshot vào báo giá/đơn nằm ở module khác: xem Q-2.

---

### Phần E — dự án thiết kế (docs 12 §4.9–§4.10, §5.4, BR-17–BR-20, BR-22)

BE đã đúng BR-17, BR-18 (đặt ảnh thư viện = sao chép, kiểm lại theo template của bản; xoá thư viện không ảnh hưởng bản đã dùng), BR-19 (tất cả hoặc không, 2 đến 20 bản), BR-20, BR-22 (đóng dự án khi không còn bản chờ duyệt; bản sửa vào dự án chỉ khi còn mở và còn chỗ). Những chỗ FE lấy dữ liệu từ endpoint khác nằm ở Phụ lục. Các mục dưới đây là chỗ BE chưa có.

#### E-1. Mẫu chữ trong thư viện dự án — P2, mở rộng FE đề xuất, **ngoài docs**

**Nói rõ.** Docs 12 §4.9 b.29 và BR-18 chỉ nói thư viện chứa logo/ảnh. "Mẫu chữ" là mở rộng do FE đề xuất (spec phần E 2026-11-12, giả định A-E1). BE không có khái niệm này (`DesignProjectAssetJpaEntity` chỉ là file; `git grep -i "library/texts|textStyle"` rỗng). Nếu nhóm không nhận mở rộng này thì FE bỏ tính năng, không cần BE làm.

**Thêm gì** (theo cách BE gọi thư viện là `assets`, thêm tài nguyên song song, quyền như `design-projects` hiện có):

- `GET /api/v1/design-projects/{id}/texts` → mảng, mới trước.
- `POST /api/v1/design-projects/{id}/texts` → 201.
- `DELETE /api/v1/design-projects/{id}/texts/{textId}` → 204.

**Request `POST`** (`library-schemas.ts` `libraryTextInputSchema`, `textStyleSchema`; `api-library.ts` `saveTextStyle`):

```json
{
  "text": "Cà phê Sáng",
  "style": {
    "fontCode": "inter",
    "sizePt": 24,
    "color": "#1F2937",
    "bold": true,
    "italic": false,
    "align": "center",
    "letterSpacingEm": 0.02,
    "lineHeight": 1.2,
    "outline": { "color": "#FFFFFF", "widthMm": 0.4 }
  }
}
```

`text` 1 đến 500 ký tự; `style` đúng các trường kiểu chữ của phần tử chữ trong layout (`engine/document/schema.ts` `textElementSchema`: `fontCode` không rỗng, `sizePt` > 0, `color` hex, `align` ∈ `left|center|right`, `bold`, `italic`, `letterSpacingEm`, `lineHeight` > 0, `outline` tuỳ chọn `{color, widthMm > 0}`).

**Response.** `{ id, text, style, createdAt }` (tên mục hiển thị FE tự cắt từ `text`).

**Lỗi.** 409 `DESIGN_PROJECT_LIBRARY_FULL` khi đủ 30 mẫu chữ (giới hạn tính riêng, FE giả định B43 cho ảnh và A-E1 cho chữ); 409 `DESIGN_PROJECT_ARCHIVED` khi dự án đã đóng (FE: dự án đóng không nhận thêm hay xoá mục thư viện nhưng vẫn đặt được vào bản); 400 `VALIDATION_FAILED`; 404 nếu không phải chủ.

**Ghi lịch sử.** BE cần quyết: thêm `TEXT_ADDED` / `TEXT_REMOVED` vào `ProjectEventType` (và `ck_design_project_event_type` trong migration), hoặc dùng lại `ASSET_ADDED` / `ASSET_REMOVED` với `notes` nêu rõ là mẫu chữ.

**Vì sao FE không tự làm được.** Không có chỗ nào ở BE để lưu mẫu chữ dùng chung giữa các bản của dự án; lưu ở trình duyệt thì mất khi đổi máy và không phải dữ liệu của dự án.

**Ưu tiên P2** vì ngoài docs.

#### E-2. Lưu ảnh của bản thiết kế vào thư viện — P2, mở rộng FE đề xuất, **ngoài docs**

**Nói rõ.** Docs BR-18 chỉ có chiều "thư viện → bản". Chiều ngược lại ("Lưu ảnh vào thư viện dự án" trong studio) là mở rộng FE đề xuất (spec phần E §6). Nếu nhóm không nhận, FE bỏ nút này.

**Thêm gì.** `POST /api/v1/design-projects/{id}/assets/from-design` — sao chép phía máy chủ, giống cách `DesignAssetService.placeFromLibrary` đã làm chiều ngược (`files.copy`).

**Request** (`library-schemas.ts` `saveImageToLibraryInputSchema`; `api-library.ts` `saveImageToLibrary`): `{ "designId": "<uuid>", "assetId": "<uuid>" }`.

**Response.** 201 `DesignProjectAssetResponse` (cùng dạng ảnh thư viện: `assetId, projectId, originalName, contentType, sizeBytes, checksum, widthPx, heightPx, storedAt`). Gọi lại với cùng `designId`+`assetId` trả ảnh đã tạo (idempotent như `placeFromLibrary`).

**Lỗi.** 404 nếu bản không thuộc dự án này, hoặc không phải của người gọi, hoặc `assetId` không phải ảnh của bản (FE tên cũ `NOT_IN_PROJECT`); 409 `DESIGN_PROJECT_LIBRARY_FULL`; 409 `DESIGN_PROJECT_ARCHIVED`; định dạng theo thư viện (PNG, JPEG, WebP) vì ảnh của bản vốn đã thuộc tập đó.

**Vì sao FE không tự làm được (trung thực).** FE có thể tải lại ảnh qua `GET /designs/{id}/assets/{assetId}/download-url` rồi `POST /design-projects/{id}/assets`. Cách đó kéo tới 50 MB qua trình duyệt hai lần, quét lại file đã sạch, và không nguyên tử. Vì BE đã có sẵn thao tác sao chép phía máy chủ nên đề xuất BE làm; nếu nhóm thấy không đáng, chuyển mục này sang Phụ lục.

#### E-3. Nhân bản bản thiết kế sang quy cách khác của cùng sản phẩm — P2, mở rộng FE đề xuất, **ngoài docs**

**Nói rõ.** Docs không có thao tác này. Nó là tiện ích "Nhân bản sang cỡ khác" của FE (spec phần E §7, giả định A-E3), vẫn tuân BR-01/BR-02 (mỗi bản một quy cách; chỉ trên quy cách `Active` có khuôn in). Gần nhất ở BE là `POST /designs/{id}/revisions`, chỉ từ bản `APPROVED` và cùng quy cách.

**Thêm gì.** `POST /api/v1/designs/{id}/clones` (cùng kiểu `/{id}/revisions`). Hợp đồng FE: `api-designs.ts` `cloneDesign`; `schemas.ts` `cloneDesignInputSchema`, `cloneResultDtoSchema`; mô phỏng chi tiết ở `src/lib/api/mock-fixtures/design-store-clones.ts`.

**Request.** Header `Idempotency-Key` (bắt buộc ở FE). Body:

```json
{
  "variantSku": "LY12-TRANG",
  "document": { "schemaVersion": 1, "templateCode": "…", "sku": "LY12-TRANG", "surfaces": {} }
}
```

`document` là bố cục đã co giãn sang vùng in của quy cách đích (`retargetDocument` phía trình duyệt): `templateCode` và `sku` của đích, các phần tử ảnh còn trỏ `assetId` **của bản nguồn**.

**Hành vi** (theo mock, đã chạy đủ test FE):

1. Nguồn phải là bản của người gọi, không `ARCHIVED` (mock không giới hạn trạng thái nguồn; BE tự quyết, FE không chặn thêm).
2. `variantSku` phải là quy cách **khác** của **cùng sản phẩm**, `ACTIVE`, sản phẩm đang cho thiết kế, có template active (dùng đúng các kiểm của `requireDesignable` và `activeOfProduct` mà `CustomerDesignService.start` đã dùng).
3. Kiểm `document` như khi lưu bố cục (`DesignDocumentRules.problem` với đích; ≤ 1.000.000 byte; ≤ 200 phần tử/mặt) và mọi `assetId` phải là ảnh của bản nguồn.
4. Tạo bản `DRAFT` mới cho đích, tên `"<tên nguồn> · <sku đích>"` cắt ở 200 ký tự; ghi lịch sử `CREATED`; tính vào giới hạn 50 bản nháp.
5. Sao chép mọi ảnh bố cục dùng sang bản mới (đã có `assets.copyAssets` và `files.copy` cho `revisions`), **đổi `assetId` trong `document` sang ảnh sao chép**, lưu `document`.
6. Vào dự án của nguồn nếu dự án `ACTIVE` và còn chỗ (cùng logic `DesignProjectService.joinRevision`); nếu không vào được, nói lý do.
7. Cùng `Idempotency-Key` + cùng nguồn trả lại bản đã tạo (201), không tạo thêm; cùng key nhưng `variantSku` khác: 422 `IDEMPOTENCY_KEY_REUSED`.

**Response.** 201:

```json
{ "design": { "...DesignDraftResponse..." }, "notInProject": "PROJECT_ARCHIVED" }
```

`notInProject` ∈ `"PROJECT_ARCHIVED" | "PROJECT_FULL"`, vắng khi bản mới vào được dự án hoặc nguồn không có dự án.

**Lỗi.** 404 nếu nguồn không phải của người gọi; 409 `DESIGN_DRAFT_LIMIT_REACHED`; 409 `PRODUCT_NOT_CUSTOMIZABLE` / 404 `PRINT_CONFIG_NOT_FOUND` như `start`; một mã mới cho "quy cách đích không hợp lệ" (khác sản phẩm, không `ACTIVE`, trùng quy cách nguồn), ví dụ `DESIGN_CLONE_TARGET_INVALID` 409 (FE sẽ map, tên do BE chọn); 400 `VALIDATION_FAILED` cho `document` sai; 413 cho `document` quá lớn.

**Vì sao FE không tự làm được (trung thực).** FE có thể ghép từ các endpoint hiện có: `POST /designs/mine` cho quy cách đích, tải lại và tải lên từng ảnh (tới 100 ảnh × 50 MB qua trình duyệt), rồi `PUT document` đã đổi `assetId`. Cách đó nhiều cuộc gọi, không nguyên tử (một bước lỗi để lại bản nháp dở và ăn một suất trong 50 bản nháp). BE đã có phần sao chép ảnh phía máy chủ nên đề xuất BE làm; nếu nhóm không muốn mở rộng ngoài docs, chuyển sang Phụ lục và bỏ tính năng.

#### E-4. `POST /api/v1/design-projects/{id}/preflight-failures` — ghi `BATCH_PREFLIGHT_FAILED` khi trình duyệt từ chối cả bộ — P2

**Thêm gì.** Giống A-3 nhưng cho dự án: ghi một dòng `BATCH_PREFLIGHT_FAILED` vào lịch sử dự án khi preflight phía studio từ chối "Gửi duyệt cả bộ", không đổi bản nào. BE chỉ ghi dòng này khi **chính nó** từ chối (`DesignBatchSubmissionService`, `ProjectEventType.BATCH_PREFLIGHT_FAILED`).

**Request** (`project-schemas.ts` `setPreflightFailureInputSchema`; `api-projects.ts` `recordSetPreflightFailure`):

```json
{
  "items": [
    {
      "designId": "<uuid>",
      "issues": [
        { "rule": "DPI_BELOW_MIN", "surfaceCode": "BODY", "elementId": "el-2", "message": "..." }
      ]
    }
  ]
}
```

`items` ≥ 1, mỗi `designId` thuộc dự án, `issues` ≥ 1 (tối đa 50), tên rule theo BE.

**Response.** 201 một dòng lịch sử dự án `{actorId, event: "BATCH_PREFLIGHT_FAILED", notes, createdAt}` (cùng dạng `DesignProjectEventResponse`); nội dung `notes` theo kiểu BE đang ghi: `"<designId>: <rule>, <rule>; …"`. Các bản thiết kế không đổi; mỗi bản vẫn ghi `PREFLIGHT_FAILED` riêng qua A-3.

**Lỗi.** 404 nếu dự án hoặc bản không thuộc người gọi; 409 `DESIGN_PROJECT_ARCHIVED`; 400 `VALIDATION_FAILED`; 429 `RATE_LIMITED`. Cùng các gợi ý an toàn như A-3.

**Docs.** 12 §5.4 `BATCH_PREFLIGHT_FAILED` ("Gửi duyệt cả bộ nhưng có bản không đạt preflight, ghi lỗi từng bản"), BR-13, BR-19.

**Vì sao FE không tự làm được.** Như A-3: lỗi do studio phát hiện (độ lấn của chữ, `ON_SEAM`) BE không thấy nên không ghi.

#### E-5. `Idempotency-Key` cho `POST /api/v1/design-projects/{id}/assets` — P2

**Thêm gì.** `DesignProjectController.upload` nhận header `Idempotency-Key` (tuỳ chọn) như `DesignAssetController` và `DesignController` (artifact) đã làm: cùng khoá + cùng file trả lại mục thư viện đã tạo, không quét/lưu/đếm thêm một suất; cùng khoá khác file: 422 `IDEMPOTENCY_KEY_REUSED`. Khoá nên gắn với `userId` và `projectId` (như `userId + ":asset:key:" + khoá` ở `DesignAssetService`).

**Request/Response.** Không đổi, chỉ thêm header. FE: `api-library.ts` `uploadLibraryImage` đã gửi `Idempotency-Key`.

**Lỗi.** 422 `IDEMPOTENCY_KEY_REUSED`.

**Docs.** 12 BR-18 (tải vào thư viện đúng một lần), `design-studio-fe-contract.md` §1 "Send `Idempotency-Key` on POSTs that create something (uploads, submissions)". Hợp đồng BE khuyên gửi khoá cho mọi lần tải nhưng upload thư viện chưa nhận (không có `@RequestHeader` trong `DesignProjectController`).

**Vì sao FE không tự làm được.** Mất phản hồi giữa chừng rồi thử lại sẽ tạo bản trùng, ăn thêm một trong 30 suất của thư viện. FE chỉ có thể tránh bằng cách đọc lại danh sách trước khi thử lại và so tên/checksum. Chạy được nhưng yếu hơn, nên P2.

---

## 4. Cần BE xác nhận

Các điều dưới đây tôi không kết luận được chỉ từ mã đọc tĩnh, hoặc là quyết định cần BE/nhóm đưa ra.

| Id  | Câu hỏi chính xác                                                                                                                                                                                                                                                                                                                                                                                                      | Vì sao hỏi                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | Nhà in nào, profile ICC nào (B35)? File PRINT_READY từ studio là RGB hay CMYK; BE chỉ **nhúng** output intent lên nội dung hiện có, hay còn phải **chuyển màu** sang CMYK theo `colorMode` của template?                                                                                                                                                                                                               | C-1: chưa rõ phạm vi việc, và PDF/X-4 có ràng buộc về không gian màu khi có output intent.                                                                                                            |
| Q-2 | `DesignService.verifySnapshot` / `verifySnapshotForSku` (gắn snapshot vào báo giá, đơn) chỉ kiểm bằng cơ sở dữ liệu (chủ sở hữu, đã chốt, manifest còn cộng ra checksum) và để file lưu trữ được kiểm "ở nơi dùng" (`verifyForFulfillment`, `fulfillmentDownload`, `verifyForPrinting`). Đó là cách hiểu chủ ý của BR-10 ("mỗi lần gắn … file lưu trữ phải khớp checksum")? Hay BR-10 đòi kiểm cả lúc gắn báo giá/đơn? | Docs 12 §4.6 b.20 và BR-10 nói kiểm ở mọi lần dùng; mã chọn kiểm lúc dùng để thanh toán/báo giá không chờ object store. Module báo giá/đơn nằm ngoài phần A, B, C, E nên tôi không đặt thành yêu cầu. |
| Q-3 | Docs 12 §3 và 01 §4.10 (giả định B34/B43) nêu định dạng mặc định PNG / JPG / **SVG / PDF**; BE chỉ nhận PNG, JPEG, WebP cho ảnh thiết kế và thư viện, và từ chối SVG, PDF ("no template could place them", `DesignProjectAssetService`, `design-studio-fe-contract.md` §11). Docs sẽ sửa theo BE, hay BE sẽ mở SVG/PDF?                                                                                                | FE đang theo BE (PNG, JPEG, WebP) và studio chưa đặt được SVG/PDF; đây là chỗ BE trái giả định ghi trong docs.                                                                                        |
| Q-4 | `variants.name` có phải tên hiển thị dành cho khách (ví dụ "Ly giấy 12oz trắng") hay chỉ là tên nội bộ? Nếu nội bộ, tên quy cách cho khách lấy từ đâu (thuộc tính, `attribute_signature`)?                                                                                                                                                                                                                             | A-1 `variantName`: tôi không đọc được nội dung cột này, `CatalogProductResponse.VariantResponse` cũng chỉ có `sku`.                                                                                   |
| Q-5 | Link `.glb` cấp trong `GET /catalog/products/{slug}/customization` (công khai, không đăng nhập) có ổn không, và nơi lưu `.glb` đã cho phép CORS `GET` từ origin storefront chưa (như hợp đồng nói cho ảnh thiết kế)? Hạn của link có chữ ký là bao lâu?                                                                                                                                                                | B-3.                                                                                                                                                                                                  |
| Q-6 | BE muốn tự đọc file `.glb` để kiểm số đo (B-5), hay chấp nhận số đo do công cụ back-office đo và chỉ lưu checksum của file? Mép dán của ly và chất liệu nền không đo được từ model: back-office điền sẵn mặc định (chất liệu lấy từ thuộc tính của quy cách) và gửi lên bằng trường hiện có của `CupModel`; BE có cần đổi gì không?                                                                                    | B-2, B-5.                                                                                                                                                                                             |
| Q-7 | A-3 và E-4: BE muốn lưu `message` do trình duyệt gửi (văn bản tự do, không tin được) hay chỉ lưu mã rule + vùng in/phần tử như `summary(issues)` đang làm?                                                                                                                                                                                                                                                             | Quyết định an toàn nội dung; FE chấp nhận cả hai (FE chỉ cần dòng lịch sử `PREFLIGHT_FAILED`).                                                                                                        |
| Q-8 | Với thiết kế `PENDING_REVIEW` thuộc dự án, BE có định cho khách một cách đọc "lượt duyệt dự án" (mã lượt, các bản trong lượt, giờ mở) không? Hiện chỉ nhân viên đọc được (`GET /design-review-rounds`); khách chỉ có `reviewRequestedAt` của từng bản.                                                                                                                                                                 | FE đang suy ra "đang chờ duyệt" từ các bản `PENDING_REVIEW` (Phụ lục F-27) nên **không phải chặn**; hỏi để biết BE có ý định đó không trước khi FE đóng chặt cách suy ra. Docs không yêu cầu.         |

---

## 5. Phụ lục — Các chỗ lệch FE sẽ tự chuyển đổi (BE không cần làm)

Mỗi dòng: chỗ lệch → FE lấy dữ liệu / hành vi đó từ đâu ở BE. Tổng cộng **36 dòng** (F-1 … F-36).

### Xuyên suốt

| Id  | Lệch                                                                           | FE lấy từ đâu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | C1: BE bỏ trường `null` (`@JsonInclude(NON_NULL)`) còn zod FE bắt buộc có khoá | FE đổi schema sang `.nullish()` rồi `?? null` ở lớp API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| F-2 | C2: bảng mã lỗi khác                                                           | FE đổi bảng map sang mã BE: `CONFLICT`, `DESIGN_NOT_DRAFT`, `DESIGN_DRAFT_LIMIT_REACHED`, `PRINT_CONFIG_NOT_FOUND`, `UNSUPPORTED_MEDIA_TYPE` (415, sai định dạng), `PAYLOAD_TOO_LARGE` (413), `DESIGN_PREFLIGHT_FAILED`, `REQUEST_BODY_TOO_LARGE`, `DESIGN_PROJECT_HAS_PENDING`, `DESIGN_IN_ANOTHER_PROJECT`, `DESIGN_PROJECT_FULL`, `DESIGN_PROJECT_ARCHIVED`, `DESIGN_PENDING_IN_PROJECT`, `DESIGN_PROJECT_LIBRARY_FULL`, `DESIGN_BATCH_PREFLIGHT_FAILED`; `DESIGN_ARCHIVED` = 404 (thiết kế `ARCHIVED` vô hình); `VALIDATION_FAILED` = 400; mã cũ `SET_TOO_SMALL` = `VALIDATION_FAILED` (dưới 2 bản), `VERSION_CHANGED` = `CONFLICT` |
| F-3 | C4: issue preflight khoá `rule` (không `ruleId`), không có `level`             | Mọi finding BE đều chặn (`design-studio-fe-contract.md` §8, B18), và tên rule đủ quyết định mức: bốn rule `note` của FE (`TOO_THIN`, `WHITE_ON_KRAFT`, `TOO_MANY_COLORS`, `CMYK_CONVERSION`) chỉ chạy ở trình duyệt, BE không bao giờ trả. FE đọc `details.issues[].rule` và gán `level = "fail"`; đổi `CARTON_SPEC_MISSING` ↔ `NO_CARTON_SPEC`; thêm `ELEMENT_INVALID`, `PRINT_FILE_INVALID` vào tập rule được đọc                                                                                                                                                                                                                     |

### Thiết kế (phần A, C)

| Id   | Lệch                                                                                     | FE lấy từ đâu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-4  | Tên trường đổi: `sourceSnapshotId`, `submittedAt`, `approvedAt`                          | `parentSnapshotId`; `reviewRequestedAt`; `reviewedAt` khi `status = APPROVED`                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| F-5  | `lastReturn {reason, returnedAt}`                                                        | `status = DRAFT` và `reviewNotes` có mặt thì `{reason: reviewNotes, returnedAt: reviewedAt}`. BE chỉ đặt `reviewNotes` khi trả lại (`returnToDraft`) và xoá khi duyệt (`approve`); bản nháp mới không có                                                                                                                                                                                                                                                                                                              |
| F-6  | `approval {snapshotId, skuCode, bundleChecksum}`                                         | `GET /designs/{id}/snapshot` chỉ khi `APPROVED`: `id`, `customerSku`, `checksum` (checksum cả bộ). Cần một cuộc gọi thêm cho mỗi bản đã duyệt, FE cache                                                                                                                                                                                                                                                                                                                                                               |
| F-7  | `product.title`                                                                          | `GET /catalog/products/{slug}` → `title` (cache theo slug); sản phẩm không còn xuất bản thì dùng `productName` của A-1, hoặc `productSlug`                                                                                                                                                                                                                                                                                                                                                                            |
| F-8  | `project {id, name, status}`                                                             | `projectId` của bản + `GET /design-projects` (danh sách, cache) hoặc `GET /design-projects/{id}`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| F-9  | `createdAt` của bản thiết kế                                                             | Không có ở BE; không màn hình nào hiển thị (FE không dùng `.createdAt` của bản ở UI), FE bỏ khỏi trường bắt buộc                                                                                                                                                                                                                                                                                                                                                                                                      |
| F-10 | Danh sách sắp theo `updatedAt` mới nhất trước                                            | BE sắp theo `createdAt` giảm dần; docs không quy định thứ tự, FE chấp nhận                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F-11 | `GET /designs/draft-count` `{drafts, limit}` (B37)                                       | `GET /designs?status=DRAFT&size=1` → `totalElements`; `limit` = 50 (`CustomerDesignRules.MAX_DRAFTS`); `409 DESIGN_DRAFT_LIMIT_REACHED` lúc tạo là phán quyết cuối                                                                                                                                                                                                                                                                                                                                                    |
| F-12 | `POST /designs` `{productSlug, sku, name, projectId?}`                                   | `POST /designs/mine` `{productId, sku, templateCode, name, projectId?}`; `productId` và `templateCode` lấy từ `templates[]` (khớp `sku`) của `/customization`                                                                                                                                                                                                                                                                                                                                                         |
| F-13 | `PATCH /designs/{id}` đổi tên                                                            | `PUT /designs/{id}/name` `{version, name}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| F-14 | `DELETE /designs/{id}` `{version}`                                                       | `POST /designs/{id}/archive` `{version}`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| F-15 | Lịch sử thiết kế: mảng, cũ trước, `{type, at, version, note}`                            | `GET /designs/{id}/history?page&size`: trang, mới trước, `{decision, at, version, notes}`. FE đọc hết các trang (size ≤ 200), đảo thứ tự, `decision` → `type` bằng enum mềm (có thêm `QUOTE_REQUESTED` và từ cũ `SENT_TO_CUSTOMER`, `CUSTOMER_CONFIRMED`…). Tập sự kiện của BE là tập docs §5.3 cộng thêm, không thiếu                                                                                                                                                                                                |
| F-16 | Lịch sử dự án: mảng, cũ trước, có `version`                                              | `GET /design-projects/{id}/history?page&size`: trang, mới trước, `{event, notes, createdAt}`, không `version` (FE đặt tuỳ chọn); có thêm `PROJECT_QUOTE_REQUESTED` (enum mềm). Ghi chú `ADDED_TO_PROJECT` của BE là `"Project <uuid>"`, FE tra tên từ danh sách dự án đã cache                                                                                                                                                                                                                                        |
| F-17 | `POST /designs/{id}/revisions`                                                           | Cùng đường dẫn; chỉ khác DTO (F-4…F-8) và mã lỗi (F-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| F-18 | `GET /designs/{id}/assets/{assetId}/url`                                                 | `GET /designs/{id}/assets/{assetId}/download-url` (`{url, expiresAt}`, cùng dạng)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F-19 | `POST /designs/{id}/submissions` (một bước, FE gửi `preflight` và `checksums`)           | Luồng BE: `PUT /designs/{id}/document` → `POST /designs/{id}/artifacts?role=&documentChecksum=` ×3 (`CUSTOMER_PREVIEW`, `PRINT_READY`, `TECHNICAL_SPEC`; multipart `file`; `Idempotency-Key`) → `GET /designs/{id}` đọc lại `version` (mỗi lần tải file làm đổi version) → `POST /designs/{id}/technical-review-requests` `{version}`. `documentChecksum` = SHA-256 hex của bố cục đã lưu (JCS, RFC 8785); BE tự tính SHA-256 của file nhận được và tự chạy preflight trên bố cục đã lưu                              |
| F-20 | `POST /designs/{id}/submission-uploads` (token tạm 24 giờ)                               | Không có khái niệm token: FE tải ba file thẳng vào từng bản bằng `POST /designs/{id}/artifacts` như F-19, đọc lại `version`, rồi `POST /design-projects/{id}/review-rounds`; BE kiểm tất cả hoặc không ở bước mở lượt                                                                                                                                                                                                                                                                                                 |
| F-21 | `GET /designs/{id}/files` `[{role, name, sizeBytes, sha256, url}]`                       | `GET /designs/{id}/artifacts` (mọi lần tải, mới trước, có `originalName`, `checksum`): FE lấy file mới nhất mỗi role; với bản `APPROVED` dùng `snapshot.artifacts` của `GET /designs/{id}/snapshot` (bốn file đóng băng, gồm PRINT_READY đã đóng dấu và PRODUCTION_INSTRUCTION, kèm checksum). `url` lấy khi bấm từ `GET …/artifacts/{artifactId}/download-url`                                                                                                                                                       |
| F-22 | `GET /catalog/products/{slug}/variants/{sku}/print-config`                               | `GET /catalog/products/{slug}/customization`, lọc `templates[]` theo `sku`. Vắng mặt = chưa có khuôn hoặc quy cách không còn `ACTIVE` hoặc sản phẩm chưa xuất bản (BE chỉ liệt kê quy cách `ACTIVE` có template active của sản phẩm `PUBLISHED`): FE dựng thành "404". `variantStatus` / `usable` suy ra từ việc có mặt hay không; `fileRules` từ `minDpi`, `allowedFileFormats`, `maxFileSizeMb` của template; `maxColors`, `allowedFontCodes` vắng = `null`; `product.title` như F-7. Riêng `hasCartonSpec` xem A-2 |
| F-23 | Template của một bản đã tạo (studio)                                                     | `GET /designs/{id}/template`: hiện hành cho bản nháp, đóng băng cho bản đã duyệt, cùng dạng một template của `/customization` thêm `active`                                                                                                                                                                                                                                                                                                                                                                           |
| F-24 | `POST /designs/{id}/assets/from-library` `{libraryItemId}`, lỗi `FILE_RULE` có `details` | `POST /designs/{id}/assets/library` `{assetId}`; BE chỉ trả `message` 415 (định dạng) hoặc 413 (dung lượng), không có `details`: FE tự dựng lý do từ `allowedFileFormats` và `maxFileSizeMb` của template của bản. BE đã kiểm bản thuộc dự án của file (404 nếu không)                                                                                                                                                                                                                                                |

### Dự án và thư viện (phần E)

| Id   | Lệch                                                                                                                                         | FE lấy từ đâu                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-25 | `description` `null` bị bỏ                                                                                                                   | Như F-1 (`.nullish()`)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F-26 | `previewUrls` (dải tối đa 4 ảnh ở thẻ dự án)                                                                                                 | `GET /design-projects/{id}` → `designs[].previewUrl` (có sau A-1), lấy 4 bản đầu. Thẻ trong danh sách cần một lần đọc chi tiết cho mỗi dự án đang hiện; FE cache và tải chậm                                                                                                                                                                                                                                                                         |
| F-27 | `openRound {id, designIds, openedAt}` (biểu ngữ "đang chờ duyệt cả bộ", làm tươi khi có lượt mở)                                             | Từ `designs` của dự án: `designIds` = các bản `PENDING_REVIEW`, `openedAt` = `min(reviewRequestedAt)`. BE không cho khách đọc "lượt duyệt" (chỉ nhân viên) nên FE không phân biệt gửi lẻ với gửi cả bộ; lời biểu ngữ đổi thành "N bản đang chờ duyệt". Không cần `roundId`; việc kiểm "lượt vừa mở có thật chưa" khi mất phản hồi dùng danh sách các bản `PENDING_REVIEW`                                                                            |
| F-28 | `updatedAt` của dự án (nhãn "Cập nhật …")                                                                                                    | BE chỉ có `createdAt` và `archivedAt`; FE hiện "Tạo lúc …" (hoặc `max(updatedAt)` của các bản khi đã đọc chi tiết). Danh sách dự án sắp theo `createdAt` mới trước                                                                                                                                                                                                                                                                                   |
| F-29 | `PATCH /design-projects/{id}` `{version, name?, description?}`                                                                               | `PUT /design-projects/{id}` `{version, name, description?}`; FE luôn gửi cả `name` hiện tại khi chỉ đổi mô tả                                                                                                                                                                                                                                                                                                                                        |
| F-30 | `GET /design-projects/{id}/designs`                                                                                                          | `designs` trong `GET /design-projects/{id}` (bản `ARCHIVED` đã bị loại); FE sắp theo `updatedAt` (tối đa 20 bản)                                                                                                                                                                                                                                                                                                                                     |
| F-31 | `POST /design-projects/{id}/designs` và `DELETE …/{designId}` trả một thiết kế                                                               | BE trả `DesignProjectResponse`: FE lấy bản đó từ `designs`. Mã lỗi theo F-2. Bản `ARCHIVED` thêm vào: 404 (`requireOwner` coi như không tồn tại)                                                                                                                                                                                                                                                                                                     |
| F-32 | `POST /design-projects/{id}/review-rounds` `{items:[…uploadToken, preflight, checksums]}` → vòng duyệt `{id, designIds, openedAt, closedAt}` | Body `{designs:[{id, version}]}` (2 đến 20, không trùng; dưới 2 là 400 `VALIDATION_FAILED`); trả `{roundId, project}`; FE lấy các bản trong lượt từ `project.designs` (`PENDING_REVIEW`). Từ chối: 422 `DESIGN_BATCH_PREFLIGHT_FAILED` với `details.designs: [{designId, issues? \| roles?}]` (`roles` = file cần dựng lại, tương đương `DESIGN_FILES_OUTDATED`); `409 DESIGN_NOT_DRAFT`, `409 CONFLICT` (version cũ), `404` (bản không thuộc dự án) |
| F-33 | `GET /design-projects/{id}/library` (ảnh + chữ, `kind`)                                                                                      | `GET /design-projects/{id}/assets` (chỉ ảnh): FE bọc `kind: "IMAGE"`, `id` ← `assetId`, `asset` ← các trường còn lại, `createdAt` ← `storedAt`. Mục chữ chỉ có nếu E-1 được nhận                                                                                                                                                                                                                                                                     |
| F-34 | `previewUrl` của ảnh thư viện                                                                                                                | `GET /design-projects/{id}/assets/{assetId}/download-url` (link inline `viewLink`, không audit), mỗi ảnh một lần, giống cách studio lấy ảnh của bản                                                                                                                                                                                                                                                                                                  |
| F-35 | `POST …/library/images` (422 `FILE_REJECTED`, 422 `LIBRARY_FULL`)                                                                            | `POST /design-projects/{id}/assets` multipart `file`: PNG, JPEG, WebP; 415 / 413 / 409 `DESIGN_PROJECT_LIBRARY_FULL` (30 file); giới hạn 120 lần tải mỗi giờ mỗi người (429)                                                                                                                                                                                                                                                                         |
| F-36 | `DELETE …/library/{itemId}` trả mục đã xoá                                                                                                   | `DELETE /design-projects/{id}/assets/{assetId}` → 204 không thân; FE giữ mục từ cache để hiển thị kết quả. Bản đã dùng giữ bản sao (BR-18)                                                                                                                                                                                                                                                                                                           |

**Không nằm ở Phụ lục và cũng không ở BE phải làm:** 7 route `/__mock/*` chỉ dùng giả lập; tương đương thật phía nhân viên đã có (`POST /designs/{id}/reviews`, `GET /design-review-rounds`, `POST /design-review-rounds/{id}/approvals`, hàng chờ duyệt).

---

## 6. Cách kiểm tra và giới hạn

- **BE (chỉ đọc, `origin/develop` @ `df34c338`):** `git show origin/develop:<path>` và `git grep -n … origin/develop -- <path>`. Đã đọc: `docs/design-studio-fe-contract.md`; `DesignDraftResponse`, `DesignDecisionResponse`, `DesignProjectResponse`, `DesignProjectSummaryResponse`, `DesignProjectEventResponse`, `DesignSnapshotResponse`, `DesignArtifactResponse`, `DesignProjectAssetResponse`; `DraftViews`, `DesignDraftJpaEntity` (xoá/đặt `reviewNotes`), `DesignSubmissionService`, `DesignBatchSubmissionService`, `DesignArtifactService`, `DesignAssetService`, `DesignProjectAssetService`, `DesignProjectService`, `DesignReviewService` (duyệt), `DesignServiceImpl` (kiểm checksum), `DesignSnapshotQueryService`, `PrintReadyStamp`, `PrintSurface`, `DesignDocumentRules`, `CustomerDesignRules`, `FileTransfers`, `FileCategory`, các controller của khách (`CustomerDesignController`, `DesignWorkflowController`, `DesignController`, `DesignAssetController`, `DesignProjectController`), `CatalogCustomizationResponse` và service/mapper, `CatalogProductResponse`, `PrintConfig`, `ProductModel`, `PrintArea`, `PrintAreaShape`, `PrintConfigService`, `CustomizationTemplateController` và các DTO; migration seed quyền.
- **FE (cây làm việc mới nhất, gồm phần E chưa commit):** `schemas.ts`, `project-schemas.ts`, `library-schemas.ts`, `errors.ts`, `api-designs.ts`, `api-submission.ts`, `api-projects.ts`, `api-library.ts`, `engine/template/schema.ts`, `engine/document/schema.ts`, `engine/preflight/**`, `components/clone-design-targets.ts`, `components/open-round-banner.tsx`, `round-mutations.ts`, `src/lib/api/mock-fixtures/design-store-clones.ts`.
- **Giới hạn:** không chạy BE, không gọi API thật; mọi nhận định về hình dạng và hành vi là từ mã nguồn tĩnh. Đã giải quyết so với báo cáo lệch: quyền `design-designs` của vai trò `CUSTOMER` có seed; 415/413 khi đặt ảnh thư viện lên bản chỉ có `message`, không có `details`; `POST /design-projects/{id}/assets` không nhận `Idempotency-Key`; `GET …/artifacts` trả mọi lần tải, mới trước. Còn lại là các câu hỏi ở mục 4.
