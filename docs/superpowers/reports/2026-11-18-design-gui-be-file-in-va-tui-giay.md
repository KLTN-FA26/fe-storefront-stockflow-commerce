# Gửi BE: file in mới (ly giấy, ly nhựa, túi giấy) và các chỗ còn lệch — đợt 18/11

Ngày: 2026-11-18. Đối chiếu với BE `origin/develop` tại `438fe6fb` (18/11).
Phía FE: storefront PR #51 (`feat/design-print-file` → `dev`, commit `cb5870d`, `e1dae7f`, `dcfffba`) và back-office
`stockflow-ui` `origin/develop` `9e52234f`. Đặc tả FE cho túi giấy: `docs/superpowers/specs/2026-11-18-tui-giay-tam-trai-phang.md`.

Tài liệu này gộp **mọi việc BE cần làm** cho đợt FE này, để BE làm một lần:

- mục 2: file in mới của storefront (ly giấy, ly nhựa) — BE hiện **từ chối** file mới;
- mục 3: túi giấy in **một tấm trải phẳng**, cấu hình in thêm **mép dán** và **phần gấp đáy**;
- mục 4: các chỗ lệch khác tìm được khi đối chiếu toàn bộ phần thiết kế (storefront + back-office) với BE;
- mục 5: câu hỏi; mục 6: những gì FE tự sửa (BE không phải làm gì).

Cảm ơn BE: toàn bộ BE-1…BE-6 của tài liệu 15/11 và S-1…S-6 đã xong (mục 6.3). Các endpoint storefront và back-office
đang gọi đều khớp đường dẫn, body, DTO, mã lỗi, version, Idempotency-Key; các mục dưới đây là phần còn lại.

## 1. Tóm tắt

| Mã    | Việc                                                                                                    | Ưu tiên |
| ----- | ------------------------------------------------------------------------------------------------------- | ------- |
| BE-1  | Kiểm tra file in theo **BleedBox**, không theo MediaBox                                                 | P1      |
| BE-2  | Đóng dấu khi duyệt: đặt TrimBox theo **gốc của BleedBox**                                               | P1      |
| BE-3  | Cấu hình OutputIntent **ISO Coated v2 (FOGRA39)** (chỉ đổi cấu hình)                                    | P1      |
| BE-8  | Túi: thêm `glueFlapMm`, `bottomFoldMm` vào mô hình túi (lưu trong `model_params_json`, sửa được)        | P1      |
| BE-9  | Túi: hình học **tấm trải phẳng** dùng chung với FE (công thức §3.2)                                     | P1      |
| BE-10 | Túi: file in là **1 trang tấm trải phẳng** — kiểm tra và đóng dấu theo tấm                              | P1      |
| BE-11 | `GET /designs/{id}/template` trả thêm `designable` và `hasCartonSpec`                                   | P1      |
| BE-4  | Đóng dấu **giữ XMP** FE đã ghi (DocumentID, VersionID, RenditionClass)                                  | P2      |
| BE-5  | Đóng dấu **giữ các lớp** (`/OCProperties`, cả lớp lót trắng) — thêm test                                | P2      |
| BE-6  | Gửi **tệp gốc của khách** (ảnh, logo) kèm bộ file cho đơn vị sản xuất                                   | P2      |
| BE-12 | `PRINT_CONFIG_INVALID` trả **`fieldErrors`** (hoặc message key tiếng Việt)                              | P2      |
| BE-7  | Docs 01 §4.10, 12 §3, B35, 17 theo file mới và cấu hình túi                                             | P3      |
| BE-13 | Hợp đồng `design-studio-fe-contract.md`: sửa thứ tự kiểm tra khi POST template; bổ sung mục túi và file | P3      |
| BE-14 | `CustomizationTemplateController` khai `Action.DELETE` nhưng không có endpoint                          | P3      |
| BE-15 | (Tuỳ chọn) đổi tên / lưu trữ / lưu bố cục: kiểm status trước version như gửi duyệt                      | P3      |

**Vì sao các mục P1.** Thiếu BE-1/BE-2, mọi lần gửi duyệt từ storefront mới đều bị `PRINT_FILE_INVALID`; thiếu
BE-8/9/10, file túi một tấm cũng bị từ chối và cấu hình túi không có chỗ lưu mép dán, gấp đáy; thiếu BE-11, studio
chặn gửi duyệt những bản BE vẫn nhận (mục 4).

## 2. File in mới của storefront (ly giấy, ly nhựa)

Từ PR #51, "Gửi duyệt" xuất hai file mới thay hai file cũ (**vai trò, tên file, kiểu nội dung, luồng upload không
đổi**):

- `PRINT_READY` (`print-ready.pdf`): **PDF/X-4**, nội dung **vector, mỗi phần tử một lớp** (OCG bật), lớp
  "Hướng dẫn kỹ thuật (không in)" (OCG tắt), OutputIntent **ISO Coated v2 (FOGRA39)**, **lề trắng 5 mm** quanh vùng
  lề tràn và **dải thông tin (slug) 14 mm** bên dưới.
  - Ly giấy (và túi, mục 3): có đường bế `CutContour` (spot, in chồng).
  - **Ly nhựa PET trong** (`material = pet-clear`): **không có `CutContour`** (in lên ly đã thành hình, không bế),
    thêm lớp **"Lót trắng (mực White)"** (OCG **bật**) nằm dưới hình: separation `White` (alternate CMYK `0 0 0 0`),
    hình in chồng (`OP true`) để giữ bản trắng bên dưới.
- `TECHNICAL_SPEC` (`technical-spec.pdf`): **file mô tả thiết kế** nhiều trang A4 ngang (vị trí, kích thước, màu từng
  phần tử, ô xác nhận bản in thử) thay cho trang đặc tả một trang.

### Hộp trang (để BE đối chiếu)

Toạ độ PDF (pt, gốc ở góc dưới-trái vùng lề tràn); `W × H` = khung vùng lề tràn của vùng in (`PrintSurface` flat
bounds, đúng như BE đang tính):

| Hộp      | Giá trị                                                                    |
| -------- | -------------------------------------------------------------------------- |
| MediaBox | `[-5 mm, -14 mm, W + 5 mm, H + 5 mm]` — lề trắng trái/phải/trên, slug dưới |
| BleedBox | `[0, 0, W, H]` — đúng khung lề tràn của mẫu                                |
| TrimBox  | khung bao của đường cắt (`outline("trim")`), cùng gốc với BleedBox         |
| CropBox  | không đặt (mặc định = MediaBox)                                            |

Ví dụ ly 12oz (`CUP12-BODY`): BleedBox 286,54 × 125,53 mm, TrimBox 279,67 × 120,85 mm, MediaBox 296,54 × 144,53 mm.

### BE-1 (P1). Kiểm tra file in theo BleedBox

**Hiện tại.** `PrintFileGeometry.problem` so **MediaBox** từng trang với vùng lề tràn của mẫu, sai số 0,5 mm
(`design/internal/service/PrintFileGeometry.java:39-50`, dòng 45 `getMediaBox()`). Chạy khi gửi duyệt
(`DesignSubmissionService.java:153`, `:310-313`; cả bộ `DesignBatchSubmissionService.java:144`) và trước khi đóng dấu
(`PrintReadyStamp.java:82`).

**Đề nghị.**

- So **BleedBox** (`page.getBleedBox()`) với `surface.flatWidth() × flatHeight()`, giữ sai số 0,5 mm. Trang không khai
  BleedBox thì PDFBox trả CropBox/MediaBox, nên file cũ vẫn qua.
- MediaBox phải **chứa** BleedBox.
- (Nên có) so TrimBox với `surface.trimBounds()`, cùng sai số, cùng mã `PRINT_FILE_INVALID`.
- Với túi: xem BE-10.

### BE-2 (P1). Đóng dấu theo gốc của BleedBox

**Hiện tại.** `PrintReadyStamp.stamp` (`PrintReadyStamp.java:80-110`) đặt CropBox **và BleedBox** = MediaBox (`:92`,
`:95`) và tính TrimBox từ góc dưới-trái **MediaBox** (`:97`): với file mới, TrimBox lệch 5 mm sang trái và 14 mm
xuống dưới, BleedBox gồm cả lề trắng và slug.

**Đề nghị.** `bleed = page.getBleedBox()`; `TrimBox = (bleed.llx + trim.x, bleed.lly + bleed.h − (trim.y + trim.h),
trim.w, trim.h)` (công thức hiện nay, đổi `media` thành `bleed`); không ghi đè BleedBox; CropBox giữ = MediaBox (nhà in
thấy slug). Test: trang có MediaBox lớn hơn BleedBox → TrimBox khớp `trimBounds()`.

### BE-3 (P1). OutputIntent FOGRA39

**Hiện tại.** `stockflow.design.print.output-intent` để trống (`application.yml:471-474`), `PrintReadyStamp` **thay**
OutputIntent FOGRA39 FE đã nhúng bằng sRGB của JDK (`PrintOutputIntentProperties.java:26-40`) — hồ sơ màn hình, trình
kiểm PDF/X-4 nghiêm sẽ từ chối.

**Đề nghị** (biến môi trường, không sửa code): `DESIGN_PRINT_ICC_PROFILE` = file `ISOcoated_v2_eci.icc` (lấy nguyên
từ storefront `public/print/icc/`, ECI cho phép phân phối lại — xem README cùng thư mục), `DESIGN_PRINT_OUTPUT_CONDITION
= FOGRA39`, `DESIGN_PRINT_OUTPUT_INFO = ISO Coated v2 (ECI)`, `registryName` để trống (mặc định
`http://www.color.org`).

### BE-4 (P2). Giữ XMP FE đã ghi

**Hiện tại.** Đóng dấu ghi XMP mới (`PrintReadyStamp.java:105-106`), mất `xmpMM:DocumentID`/`InstanceID` (`uuid:` từ
32 hex đầu checksum bố cục, trùng trailer `/ID`), `xmpMM:VersionID`, `xmpMM:RenditionClass`, ngày tạo/sửa,
`xmp:CreatorTool`.

**Đề nghị.** Đọc XMP sẵn có, chỉ đặt lại các trường BE quản (`dc:title`, `pdfxid:GTS_PDFXVersion`, `pdf:Trapped`,
`xmp:ModifyDate`, `xmp:MetadataDate`); hoặc nếu viết mới thì đặt `DocumentID` từ checksum bố cục và giữ `VersionID`,
`RenditionClass = default`.

### BE-5 (P2). Giữ các lớp khi đóng dấu

Catalog có `/OCProperties`: mỗi phần tử một OCG (bật), lớp hướng dẫn trong `/D /OFF`, ly nhựa có thêm lớp lót trắng
(bật). PDFBox mở rồi lưu thì giữ catalog nhưng chưa có test ghim. **Đề nghị** thêm test: sau `stamp`, đủ OCG, lớp
hướng dẫn vẫn `OFF`, lớp phần tử và lớp lót trắng vẫn bật, separation `White` còn nguyên. (`DesignPreflight` báo
`RGB_COLOUR` vì ảnh là sRGB — đúng thiết kế.)

### BE-6 (P2). Gửi tệp gốc của khách cho đơn vị sản xuất

**Hiện tại.** Bộ file khi duyệt = ảnh xem trước, file in đã đóng dấu, đặc tả, hướng dẫn sản xuất
(`DesignReviewService.java:93-94`, `:277-294`); ảnh/logo khách tải lên không đi kèm. **Vì sao cần**: in màu pha (flexo,
in khô), nhà in cần logo gốc để tách màu; file mô tả đã ghi "Tệp gốc: ảnh và logo khách tải lên". **Đề nghị** đưa các
asset mà bố cục đã chốt dùng (lọc theo `assetId` trong document đã chốt) vào snapshot / gói Đơn sản xuất (docs 12 §3,
17), cùng cơ chế link tải có kiểm checksum.

## 3. Túi giấy: mép dán, gấp đáy và file in một tấm trải phẳng

Chủ dự án đã chốt: túi in **một tấm liền** (bế, gấp ống, dán mép, gấp đáy) như ngoài xưởng. Studio vẫn cho khách
thiết kế từng mặt (FRONT, BACK, LEFT, RIGHT) như hiện nay; storefront ghép 4 mặt vào tấm khi xuất file in.

### BE-8 (P1). Hai trường mới trong mô hình túi

**Hiện tại.** `BagModel(widthMm, gussetMm, heightMm, topFoldMm, handle, material)` (`product/api/BagModel.java:14`),
request `ProductModelRequest` (mọi trường nullable, chỉ `kind` bắt buộc), mapper
`CustomizationTemplateWebMapper.java:65-66`, kiểm tra `requireBag` (`PrintConfigRules.java:205-219`), lưu thô trong
`model_params_json` (`PrintConfigPersistenceMapper.java:94-101`), trả về qua `TemplateShapes.java:111` và
`CatalogCustomizationWebMapper.java:41`.

**Đề nghị.**

- Thêm `glueFlapMm` (mép dán dọc) và `bottomFoldMm` (độ sâu phần gấp đáy), số mm, vào `BagModel`,
  `ProductModelRequest`, response (`CustomizationTemplateResponse`, `/designs/{id}/template`, catalog customization).
  **Không cần đổi bảng** (khoá trong JSON).
- Kiểm tra: `0 ≤ glueFlapMm ≤ 100`; `0 ≤ bottomFoldMm ≤ gussetMm`. Lỗi trả `fieldErrors` `model.glueFlapMm`,
  `model.bottomFoldMm` (BE-12).
- Thiếu khi ghi (request không gửi) hoặc bản ghi cũ chưa có: dùng mặc định **`glueFlapMm = 20`**,
  **`bottomFoldMm = round2(0,6 × gussetMm)`** — đúng giá trị back-office điền sẵn. ⚠️ Giả định, chờ xưởng xác nhận.
- Hai số **không do file `.glb` quyết định**: không đưa vào `ModelFileRules` (`ModelFileRules.java:87-93`), sửa không
  cần file mới — giống `topFoldMm`.

### BE-9 (P1). Hình học tấm trải phẳng (dùng chung với FE)

BE và FE phải tính ra **cùng kích thước**, nếu không BE-10 sẽ từ chối file. Ký hiệu: `W = widthMm`, `g = gussetMm`,
`H = heightMm` (đã gồm gấp miệng), `T = topFoldMm`, `G = glueFlapMm`, `B = bottomFoldMm`,
`P = round2(H) − round2(T)` (chiều cao in được của mặt, đúng như `bagAreas` hiện nay, `PrintConfigRules.java:164-176`),
`b = max(bleedMm của 4 vùng in)`.

- **Trim tấm**: `Wt = G + 2W + 2g`, `Ht = T + P + B`. **Bleed box tấm**: `(Wt + 2b) × (Ht + 2b)`, trim ở `(b, b)`.
- **Vị trí mặt** (góc trên-trái trim của mặt, toạ độ trim tấm, y xuống dưới): FRONT `(G, T)`, RIGHT `(G + W, T)`,
  BACK `(G + W + g, T)`, LEFT `(G + 2W + g, T)`; kích thước như vùng in hiện nay (`W × P` hoặc `g × P`).
- **Đường bế**: chữ nhật trim `(0, 0, Wt, Ht)`. Nếp gấp dọc tại `G, G+W, G+W+g/2, G+W+g, G+2W+g, G+2W+1,5g`; ngang
  tại `T` và `T + P`.
- Ví dụ để ghim test: `W 260, g 120, H 320, T 40, G 20, B 72, b 3` → `P 280`, `Wt 780`, `Ht 392`, bleed box
  `786 × 398` mm.

Đề nghị đặt công thức này cạnh `PrintSurface` (`design/internal/domain/PrintSurface.java:74` hiện chỉ có mặt rời),
ví dụ `BagSheet.of(model, areas)`, kèm test bằng đúng các số trên (FE ghim cùng số).

### BE-10 (P1). File in của túi = 1 trang tấm trải phẳng

- `PrintFileGeometry.problem` với `parametric-bag`: yêu cầu **đúng 1 trang**; BleedBox `(Wt + 2b) × (Ht + 2b)`
  (±0,5 mm), TrimBox `Wt × Ht` (±0,5 mm); MediaBox chứa BleedBox. Ly giữ quy tắc một trang mỗi vùng in.
- `PrintReadyStamp.stamp` với túi: TrimBox = trim tấm theo gốc BleedBox (cùng công thức BE-2).
- Vùng in của túi trong DB **không đổi** (4 vùng rời, khách vẫn thiết kế từng mặt); chỉ file in là một tấm.
- File mô tả (`TECHNICAL_SPEC`) có thêm trang "Tấm trải phẳng"; hướng dẫn sản xuất (`ProductionInstructionSheet`) nên
  ghi `Wt × Ht`, mép dán, gấp miệng, gấp đáy cho túi.

## 4. Chỗ lệch khác tìm được khi đối chiếu

### BE-11 (P1). Bản thiết kế còn gửi duyệt được không, và quy cách thùng

**Hiện tại.**

- Lúc gửi duyệt BE chỉ cần variant ACTIVE và sản phẩm CUSTOMIZABLE, APPROVED hoặc PUBLISHED
  (`printConfigs.designable()`, `PrintConfigService.java:376-384`; gọi ở `DesignSubmissionService.java:191-199`), **không**
  cần template còn active (đúng B39: bản nháp giữ template cũ) và kiểm quy cách thùng (`:195`, `hasCartonSpec`
  `:356-358`).
- `GET /designs/{id}/template` (`TemplateShapes.java:34-61`) **không trả** hai điều đó, nên storefront phải suy từ
  `GET /catalog/products/{slug}/customization` — endpoint này chỉ liệt kê sản phẩm PUBLISHED và template active
  (`CatalogCustomizationService.java:73-81`).
- Hậu quả: khi template bị ngừng mà không có bản thay (variant vẫn ACTIVE), hoặc sản phẩm quay về APPROVED, studio báo
  "Quy cách này hiện không còn nhận thiết kế" / "chưa có quy cách thùng" và **chặn gửi duyệt**, dù BE vẫn nhận.

**Đề nghị.** Trả thêm `designable: boolean` và `hasCartonSpec: boolean` trên `GET /designs/{id}/template`, tính bằng
đúng các điều kiện của `DesignSubmissionService.plan`. Trong lúc chờ, FE coi "không có trong catalog" là **chưa biết**
(lưu ý, không chặn) — mục 6.

### BE-12 (P2). `PRINT_CONFIG_INVALID` không chỉ ra trường

**Hiện tại.** Mọi lần từ chối cấu hình in đi qua `PrintConfigRules.invalid(reason)` (`PrintConfigRules.java:251`) với
lý do tiếng Anh, không message key, không `fieldErrors`. Back-office (`save-error.ts:25-40`) đã sẵn ánh xạ
`model.seamMm`, `model.rimMm`, `model.topFoldMm`, `printAreas[i].safeMarginMm`, `printAreas[i].bleedMm` nhưng không bao
giờ nhận được → người dùng chỉ thấy một câu chung.

**Đề nghị.** Trả `fieldErrors` (đường dẫn như trên, thêm `model.glueFlapMm`, `model.bottomFoldMm`) với mã luật, hoặc
message key tiếng Việt cho từng luật.

### BE-13 (P3). Hợp đồng FE

- `docs/design-studio-fe-contract.md:235-237` ghi "file first, then the product", nhưng `create()` chạy
  `computeAreas(draft)` (400 `PRINT_CONFIG_INVALID`) **trước** khi quét file và kiểm sản phẩm
  (`PrintConfigService.java:190-196`): POST multipart với mô hình sai trên sản phẩm không CUSTOMIZABLE trả 400, không
  phải 409. Sửa tài liệu (hoặc đổi thứ tự).
- Bổ sung: `glueFlapMm`, `bottomFoldMm`; file in túi một tấm; hộp trang file mới; lớp lót trắng ly nhựa;
  `designable`/`hasCartonSpec`.

### BE-14 (P3). Quyền DELETE không có endpoint

`CustomizationTemplateController.java:61` khai `Action.DELETE` nhưng không có `@DeleteMapping`. Bỏ quyền hoặc thêm
endpoint.

### BE-15 (P3, tuỳ chọn). Thứ tự kiểm tra ở các lệnh sửa bản nháp

Đổi tên, lưu trữ, lưu bố cục vẫn kiểm version trước status (`CustomerDesignService.java:408-416` `lockOwnDraft`): bản
đã gửi duyệt ở nơi khác trả `CONFLICT` thay vì `DESIGN_NOT_DRAFT`. FE đang tự đọc lại thiết kế nên không lỗi; làm cho
đồng bộ với gửi duyệt (S-6) nếu tiện.

### BE-7 (P3). Docs

- 01 §4.10 (cấu hình in): túi có **mép dán** và **phần gấp đáy** (sửa được, gợi ý mặc định §BE-8).
- 12 §3 (bảng vai trò file): `PRINT_READY` = PDF/X-4 vector nhiều lớp; ly nhựa có lớp lót trắng, không bế; túi là một
  tấm trải phẳng. `TECHNICAL_SPEC` = **file mô tả thiết kế**.
- B35: PDF/X-4 vector, OutputIntent FOGRA39, lề trắng 5 mm + slug 14 mm.
- 17 (Đơn sản xuất): xem Q2.

## 5. Câu cần BE trả lời

- **Q1.** Có chỗ nào sau duyệt (Đơn sản xuất, link tải cho đơn vị sản xuất, dàn trang) đang giả định trang PDF = vùng
  lề tràn, hoặc túi = 4 trang? Nếu có, đổi cùng BE-1/BE-2/BE-10.
- **Q2.** Với sản phẩm thiết kế riêng, có bật **mặc định** cờ "duyệt mẫu in thử" trên Đơn sản xuất không? Nhà in tự chế
  bản từ file vector + file mô tả, nên bản in thử là chốt chặn cuối (cần chủ dự án chốt).
- **Q3.** Sau này BE có phục vụ hồ sơ màu qua API (để FE bỏ bản trong `public/print/icc/`) không?
- **Q4.** Còn bao nhiêu template chưa có file / model (câu hỏi BE-2 ngày 15/11, chưa có trả lời)?

## 6. Để BE nắm (FE tự làm, BE không phải làm gì)

### 6.1. File in và file mô tả

- Vai trò, tên file, `contentType`, khoá chống trùng, luồng upload **không đổi**. File in mẫu ~1,5 MB (đã gồm hồ sơ
  FOGRA39 nén ~1,4 MB), dưới 50 MB.
- Trang nào FE chưa vẽ được vector (thiếu phông, màu lạ…) thì trang (hoặc mặt túi) đó dạng ảnh 300 DPI như cũ; hộp
  trang, OutputIntent, slug, lớp hướng dẫn vẫn như trên. Ly nhựa ở trang dạng ảnh ghi "Chưa có lớp lót trắng".
- `specText` gửi `PUT …/specification` (≤ 4000 ký tự) không đổi.

### 6.2. FE sửa cho khớp BE trong đợt này

- **Storefront**:
  - Gửi duyệt cả bộ đọc `details.designs[{designId, errorCode}]` (hiện chỉ đọc `details.designIds`); sửa chú thích cũ
    "BE kiểm version trước status".
  - Mock khớp BE: status trước version; mã lỗi cả bộ theo NOT_FOUND → DESIGN_NOT_DRAFT → CONFLICT kèm
    `details.designs`; bản ngoài dự án được nêu tên; kiểm khổ trang file in như `PrintFileGeometry`; giữ mọi lần tải
    file. Sửa test đang dựa vào hành vi cũ.
  - Trong lúc chờ BE-11: quy cách không có trong catalog = chưa biết (không chặn gửi duyệt).
  - Túi: đọc `glueFlapMm`, `bottomFoldMm` (thiếu → mặc định BE-8), xuất file in một tấm (BE-9, BE-10).
- **Back-office**:
  - Form cấu hình in túi thêm "Mép dán (mm)", "Phần gấp đáy (mm)" (gợi ý BE-8) và hình xem trước tấm trải phẳng.
  - Kiểm tra trước các luật BE đang có mà form chưa kiểm: `seamMm ≤ 100`, góc quét + mép dán của ly < 2π, lề tràn <
    bán kính trong, `safeMarginMm ≤ 500`, `2 × safeMargin < min(rộng, cao)` mỗi vùng in, đáy ly không rộng hơn
    miệng, các số ≤ 2000; `maxColors` 1–12; `allowedFontCodes` không rỗng, mã ≤ 64 ký tự; mã template không bắt đầu
    bằng `-`.
  - Sửa chú thích / thông điệp cũ về kích hoạt (nay là 409 `PRINT_CONFIG_MODEL_FILE_REQUIRED`).
  - Chưa có (để sau, không phải lệch): tải lên khuôn tham chiếu (`PUT …/reference-file`), màn hình duyệt thiết kế cho
    Quản lý kinh doanh (`design-designs:APPROVE`, review queue, review rounds).

### 6.3. Đã xong ở BE (cảm ơn)

- 15/11 BE-1 (template + `.glb` một request), BE-2 (số đo đổi cùng file), BE-3 (bảng ghép mesh đủ tên), BE-4 (từ chối
  cả bộ nêu từng bản), BE-5 (hợp đồng), BE-6 (test công thức bằng số).
- S-1…S-6 (từ chối nêu từng bản và mã, khoá, 404 có tên, tài liệu tải file, shape `/template`, status trước version khi
  gửi duyệt); file `.glb` tải về đúng đuôi.
