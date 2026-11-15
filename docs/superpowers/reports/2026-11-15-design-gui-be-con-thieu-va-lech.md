# Gửi BE: phần design còn thiếu hoặc còn lệch so với FE

Ngày: 2026-11-15. Đối chiếu với BE `origin/develop` tại `85e6036a` (14/11).
Phía FE: storefront nhánh `feat/design-m12-a-foundation`, back-office nhánh `feat/product-design-print-config`.

Cảm ơn BE đã làm gần hết danh sách gửi ngày 13/11: trong 16 mục, 15 mục đã có. Tài liệu này chỉ nêu **những gì BE
còn cần làm** (mục 2), **những câu cần BE trả lời** (mục 3), và để BE nắm, **những chỗ lệch FE sẽ tự chuyển đổi**
(mục 4, BE không phải làm gì).

Tài liệu này thay cho ghi chú dưới B-1 và mục B-6 của tài liệu ngày 13/11
(`2026-11-13-design-yeu-cau-bo-sung-cho-be.md`). Phần D (SKU riêng, yêu cầu báo giá) không nằm trong đợt đối chiếu này.

## 1. Tóm tắt

| Mã   | Việc                                                                                          | Ưu tiên |
| ---- | --------------------------------------------------------------------------------------------- | ------- |
| BE-1 | Lưu template và file `.glb` trong **một request**                                             | P1      |
| BE-2 | Số đo đọc từ file chỉ được đổi **cùng với file mới** (B-6)                                    | P1      |
| BE-3 | Bắt bảng ghép vùng in ↔ mesh **đủ và đúng tên** khi template có file (phần còn thiếu của B-2) | P1      |
| BE-4 | Lỗi gửi duyệt cả bộ **nêu rõ thiết kế nào** gây lỗi                                           | P2      |
| BE-5 | Cập nhật `docs/design-studio-fe-contract.md` theo các thay đổi A-1…E-5 và B-1…B-5             | P2      |
| BE-6 | Thêm một test ghim công thức vùng in bằng số cụ thể, giống test bên FE                        | P3      |

**Vì sao BE-1, BE-2, BE-3 là P1.** Chủ dự án đã quyết định: việc đo và kiểm file `.glb` chỉ chạy ở back-office lúc
upload; số đo 2D (đường kính, chiều cao, vị trí dải in, kích thước mặt túi) được **sinh ra từ chính file**.
Storefront không kiểm lại: nó dán hình của khách lên file `.glb` theo các số đo đã lưu. Nếu số đo và file không
còn mô tả cùng một sản phẩm, khách sẽ thấy hình ở một chỗ trên 3D trong khi file in ra chỗ khác, và không có gì báo
lỗi. Chỉ BE chặn được việc đó sau khi đã lưu.

## 2. Việc BE cần làm

### BE-1 (P1). Lưu template và file `.glb` trong một request

**Hiện tại.**

- `POST` và `PUT …/customization-templates[/{templateId}]` chỉ nhận JSON (`@RequestBody CustomizationTemplateRequest`,
  `product/internal/controller/CustomizationTemplateController.java:81-109`).
- File chỉ đi qua request riêng `PUT …/{templateId}/model-file?version=` (`:157-169`), cần `version` do request trước
  trả về.
- Giữa hai request, BE giữ số đo mới với file cũ (hoặc chưa có file) và checksum cũ. Nếu request gửi file hỏng
  (rớt mạng, không qua quét virus, quá dung lượng), cặp bị lệch luôn. Với template đang dùng, storefront đọc ngay
  cặp lệch đó.

**Đề nghị.**

- `POST …/customization-templates` và `PUT …/{templateId}` nhận thêm `multipart/form-data` với hai phần:
  - `template`: JSON, đúng các trường của `CustomizationTemplateRequest` hiện nay (cả `version` khi `PUT`);
  - `file`: file `.glb`, không bắt buộc; cùng các luật như `model-file` hiện nay (chữ ký `glTF` bản 2, tối đa
    10 MB, quét virus).
- Vẫn giữ kiểu JSON trên cùng đường dẫn cho các lần sửa không kèm file (Spring chọn theo `consumes`).
- Có file thì BE quét và chuẩn bị file **trước**, rồi cập nhật số đo, bảng ghép, khoá file, tên file và checksum
  **trong cùng một transaction**; `version` chỉ tăng một lần. Transaction hỏng thì không có gì thay đổi; object
  đã ghi vào kho trở thành file mồ côi, được dọn như các file mồ côi khác.
- Lỗi giữ như `model-file` hiện nay: 415 sai định dạng, 413 quá dung lượng, 400 `VALIDATION_FAILED` khi không qua
  quét, 409 `OPTIMISTIC_LOCK` khi `version` cũ. Response giữ nguyên `CustomizationTemplateResponse`.
- `PUT …/model-file` gửi file **một mình** cũng làm lệch cặp (file mới, số đo cũ). Đề nghị bỏ endpoint này, hoặc
  cho nó từ chối khi template đã có số đo, với cùng mã lỗi của BE-2.

### BE-2 (P1). Số đo đọc từ file chỉ đổi cùng file mới (B-6)

**Hiện tại.** `PrintConfigService.update` (`product/internal/service/PrintConfigService.java:157-173`) nhận mọi số
đo trong `model` mà không xem file đang lưu. Không có luật, mã lỗi hay trường nào giữ số đo và file thành một cặp.

**Đề nghị.** Khi template **đã có file `.glb`**, một request **không kèm file** mà đổi bất kỳ giá trị nào dưới đây
thì BE từ chối, gợi ý 409 `PRINT_CONFIG_MODEL_FILE_REQUIRED` ("số đo đọc từ file chỉ đổi khi kèm file mới"):

| Loại                   | Các giá trị đọc từ file                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Ly (`parametric-cup`)  | `topDiameterMm`, `bottomDiameterMm`, `heightMm`, `bandTopOffsetMm`, `bandBottomOffsetMm` |
| Túi (`parametric-bag`) | `widthMm`, `gussetMm`, và chiều cao in được của mặt túi `heightMm − topFoldMm`           |
| Chung                  | `kind` (ly hay túi), và bảng ghép `model3d.surfaces`                                     |

Vẫn được sửa tự do, không cần file: `name`, `minDpi`, `colorMode`, `allowedFileFormats`, `maxFileSizeMb`,
`maxColors`, `allowedFontCodes`, `seamMm`, `rimMm`, `material`, `handle`, tên và lề của từng vùng in. Riêng
`topFoldMm` của túi: được đổi nếu `heightMm` đổi theo để `heightMm − topFoldMm` giữ nguyên; back-office gửi đúng như
vậy.

**Không còn số đo gõ tay** (chủ dự án chốt: số đo 2D luôn sinh ra từ file 3D, xem Q-5). Vì vậy:

- tạo template (`POST`) phải kèm file `.glb`; thiếu file thì từ chối, gợi ý 400 `PRINT_CONFIG_MODEL_FILE_REQUIRED`;
- kích hoạt template phải có file và bảng ghép hợp lệ (BE-3); hiện `activate` chỉ kiểm `model` khác rỗng
  (`PrintConfigService.java:180-196`);
- template cũ chưa có file (tạo trước thay đổi này) vẫn đọc được, nhưng chỉ sửa được các giá trị "sửa tự do" ở trên
  cho tới khi được tải file lên; BE cho biết có bao nhiêu template như vậy để back-office xử lý.

### BE-3 (P1). Bảng ghép vùng in ↔ mesh phải đủ và đúng tên khi có file

**Hiện tại.** `requireSurfaces` (`PrintConfigService.java:370-402`) chỉ kiểm mã vùng in có thật, không trùng, tên
mesh dài 1–100 ký tự. BE cho phép template có file mà bảng ghép rỗng, thiếu vùng in, hoặc tên mesh tuỳ ý; kích hoạt
(`:180-196`) cũng không kiểm.

**Vì sao cần.** Storefront chỉ tìm được mesh theo tên `print:<mã vùng in>` (quy ước của file `.glb`). Khi bảng ghép
thiếu một vùng in hoặc sai tên, storefront bỏ qua cả model 3D và dùng mẫu dựng bằng code; khách không biết vì sao.

**Đề nghị.** Khi template có file (đã lưu, hoặc gửi kèm trong cùng request):

- mỗi vùng in của template có **đúng một** dòng trong `model3d.surfaces`;
- `meshName` phải đúng bằng `print:` + `printAreaCode` (ví dụ `print:BODY`, `print:FRONT`).

Sai thì trả 422 `PRINT_CONFIG_SURFACES_INVALID` với `fieldErrors` như hiện nay. Kiểm lại cùng điều kiện khi kích hoạt
template.

### BE-4 (P2). Lỗi gửi duyệt cả bộ nêu rõ thiết kế nào

**Hiện tại.** Trong `DesignBatchSubmissionService` (`design/internal/service/DesignBatchSubmissionService.java:96-106`),
vòng chuẩn bị gọi `submissions.plan(...)` cho từng thiết kế. Một thiết kế có `version` cũ hoặc không còn là bản nháp
ném 409 `CONFLICT` hay `DESIGN_NOT_DRAFT` mà không nói thiết kế nào.

**Đề nghị.** Thêm `details.designIds` (danh sách id thiết kế gây lỗi) vào hai lỗi này khi chúng phát sinh trong
`POST /design-projects/{id}/review-rounds`, giống cách `DESIGN_BATCH_PREFLIGHT_FAILED` đã trả `details.designs`.
Để khách biết phải mở lại thiết kế nào.

### BE-5 (P2). Cập nhật tài liệu hợp đồng cho FE

`docs/design-studio-fe-contract.md` chưa có các thay đổi gần đây: không có `previewUrl`, `variantName`, `productName`
(A-1) và chưa mô tả `model3d`, các endpoint thư viện chữ, nhân bản, ghi preflight hỏng. Đề nghị cập nhật tài liệu
này, và cập nhật tiếp cùng BE-1 đến BE-4.

### BE-6 (P3). Ghim công thức vùng in bằng số cụ thể

**Hiện tại.** Công thức tính vùng in từ số đo đang có ở ba nơi: BE (`product/internal/domain/CupGeometry.java`,
`PrintConfigRules.java`), storefront và back-office. Đối chiếu ngày 15/11: ba nơi dùng cùng công thức (hình quạt của
ly, ngưỡng coi là ly trụ 0,5 mm, chiều rộng ly trụ `π × đường kính miệng + mép dán`, mặt túi `rộng × (cao − gập
miệng)`, khung bao của hình quạt) nên cho cùng kết quả; BE chỉ làm tròn khi lưu tới 0,01 mm. Nhưng chưa có gì tự
phát hiện nếu một bên sửa công thức.

**Đề nghị.** Thêm một test ở BE với các số viết thẳng trong test, giống test bên FE:
ly 90 / 60 / 110 mm, dải in cách miệng 6 mm, cách đáy 8 mm, mép dán 8 mm → bán kính trong 230,04 mm, bán kính ngoài
327,05 mm, góc quét 0,84894 rad, khung 279,67 × 120,85 mm. Bên nào đổi công thức thì test của bên đó báo ngay.

## 3. Câu hỏi và trả lời

| Mã  | Câu hỏi                                                                                                                         | Trả lời (chủ dự án, 15/11)                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | Kho file (S3) ở môi trường chạy thật có cho phép tải từ origin của storefront và back-office (CORS `GET`), có chạy https không? | **Có**, cả hai. BE không cần làm gì thêm.                                                                                                                                                                                                         |
| Q-2 | Danh sách mã `rule` của preflight (`design/internal/domain/LayoutPreflight.java`) đã cố định chưa?                              | FE dịch theo danh sách hiện có; nếu BE thêm hoặc đổi `rule` thì báo FE để cập nhật sau.                                                                                                                                                           |
| Q-3 | Hồ sơ màu ICC dùng thật cho file in (hiện BE nhúng sRGB tạm, `DESIGN_PRINT_ICC_PROFILE` để trống).                              | **Còn mở**, chờ chủ dự án hỏi nhà in: tên và file hồ sơ ICC; mỗi chất liệu (giấy trắng, kraft, nhựa PET trong) có hồ sơ riêng không, vì BE hiện chỉ cấu hình được một hồ sơ chung; nhà in nhận file RGB rồi tự chuyển màu, hay cần file CMYK sẵn. |
| Q-4 | Nhân viên sale có cần quyền `product-customization-templates` không?                                                            | **Không.** Giữ như BE hiện nay (Sales Manager, System Admin).                                                                                                                                                                                     |
| Q-5 | Template không có file `.glb` còn được tạo bằng số gõ tay không?                                                                | **Không.** Số đo 2D luôn sinh từ file 3D. BE bắt buộc file như ở BE-2.                                                                                                                                                                            |

## 4. Để BE nắm: những chỗ lệch FE sẽ tự chuyển đổi

BE không cần làm gì ở các mục này. Liệt kê để BE biết FE sẽ gọi theo đúng hợp đồng hiện tại của BE.

**Chung**

- BE bỏ hẳn trường rỗng thay vì gửi `null`: FE đọc theo kiểu "có thể vắng".
- Mã lỗi: FE dùng đúng mã của BE (`CONFLICT`, `DESIGN_*`, `PRINT_CONFIG_*`, `VALIDATION_FAILED`, 413, 415, 429).
- Preflight: dùng khoá `rule`; mọi lỗi đều chặn (không có mức cảnh báo, theo B18).

**Thiết kế**

- Tạo thiết kế: `POST /designs/mine` với `productId`, `templateCode`.
- Đổi tên: `PUT /designs/{id}/name`. Lưu trữ: `POST /designs/{id}/archive`.
- Lịch sử: đọc theo trang, mới nhất trước, trường `decision` và `notes`.
- Số bản nháp: FE tự đếm qua `GET /designs?status=DRAFT&size=1`.
- Ảnh: `GET …/assets/{assetId}/download-url`; lấy ảnh từ thư viện: `POST …/assets/library` với `assetId`.

**Gửi duyệt và file**

- Luồng gửi duyệt bốn bước: lưu bố cục; tải từng file qua `…/artifacts?role=&documentChecksum=`; đọc lại `version`;
  gọi `technical-review-requests`.
- FE xử lý `DESIGN_FILES_OUTDATED`; không ghi `preflight-failures` lần nữa khi chính BE đã ghi lúc gửi duyệt hỏng.
- Danh sách file: `GET …/artifacts`, có vai trò `PRODUCTION_INSTRUCTION`; tải từng file qua `download-url`; file đã
  duyệt bị hỏng là 409 `CONFLICT`.

**Cấu hình in (storefront)**

- Đọc `GET /catalog/products/{slug}/customization`, lọc `templates[]` theo `sku`.
- Thiết kế đã có thì đọc `GET /designs/{id}/template`: bản nháp lấy template hiện tại, bản đã duyệt lấy template
  đóng băng.
- `model3d { url, surfaces }` nằm trong từng template; link ký có hạn 1 giờ.

**Dự án và thư viện**

- Sửa dự án bằng `PUT`.
- Thư viện tách thành `/assets` và `/texts`, FE tự gộp; xoá trả 204.
- Lịch sử dự án đọc theo trang, có thêm các sự kiện `TEXT_ADDED`, `TEXT_REMOVED`.
- Gửi duyệt cả bộ: body `{ designs: [{ id, version }] }`.

**Cấu hình in (back-office)**

- `model3d { hasFile, fileName, fileChecksum, surfaces }`; xem file đã lưu qua `…/model-file/download-url`.
- Mã lỗi `PRINT_CONFIG_SURFACES_INVALID` (422) và `VALIDATION_FAILED` (400).
- Bộ quyền `product-customization-templates:{VIEW_PAGE, READ, CREATE, UPDATE, DELETE}`.
- Kích hoạt và ngừng dùng: đã khớp, không đổi.

## 5. Những gì BE đã làm khớp (ghi nhận)

| Mục       | Tình hình                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| A-1       | Ảnh xem trước, tên biến thể, tên sản phẩm trên thiết kế: xong                                               |
| A-2       | `hasCartonSpec` trong `/customization`: xong                                                                |
| A-3       | Ghi preflight hỏng từ trình duyệt: xong (`rule`; `message` không lưu, FE đồng ý)                            |
| B-1       | Tải, quét, lưu `.glb`: xong dạng request riêng (đề nghị đổi theo BE-1)                                      |
| B-2       | Bảng ghép vùng in ↔ mesh: xong phần nhận và kiểm cơ bản (đề nghị bổ sung theo BE-3)                         |
| B-3       | Storefront nhận `model3d { url, surfaces }` qua `/customization` và `/designs/{id}/template`: xong          |
| B-4       | Bản đã duyệt giữ đúng model lúc duyệt: xong                                                                 |
| B-5       | Lưu checksum SHA-256 của file: xong                                                                         |
| C-1       | Hồ sơ màu trong PDF/X-4: xong tạm (chờ Q-3)                                                                 |
| C-2       | Kiểm file trước khi cấp link tải: xong                                                                      |
| E-1 → E-5 | Thư viện chữ, lưu ảnh vào thư viện, nhân bản, ghi preflight hỏng theo lô, upload thư viện không trùng: xong |
