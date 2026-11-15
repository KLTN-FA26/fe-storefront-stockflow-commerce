# Module 12 — phần E, dự án thiết kế (spec)

Ngày: 2026-11-12. Nhánh: `feat/design-m12-a-foundation`. Nguồn: docs `ecommerce/12-product-design`
§4.9–§4.10, §5.3–§5.4, BR-17–BR-20, BR-22; câu hỏi mở B42, B43. Xây tiếp trên phần A
(`2026-11-09-design-module12-a-foundation-design.md`), đợt in uốn chính xác và bố cục studio A.

## 1. Bối cảnh và các quyết định

### Người dùng đã chọn (brainstorming, 2026-11-12)

| Chủ đề                        | Quyết định                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phạm vi đợt này               | Dự án, thư viện của dự án, trang dự án xem các bản cạnh nhau và **gửi duyệt cả bộ** (kèm giả lập phía người duyệt). **Báo giá cả dự án (§4.11, BR-21) để sau phần D** (phần D làm yêu cầu báo giá). |
| Ngoài docs, ý 1               | **Nhân bản sang cỡ khác**: chép một bản sang **variant khác của cùng một product** (các ly của một product khác nhau về cỡ, gần như không khác hình dáng); bố cục được co giãn theo vùng in mới.    |
| Ngoài docs, ý 2               | **Chữ dùng chung** trong thư viện dự án, bên cạnh ảnh, dùng được cho mọi product trong dự án (ly và túi đựng ly dùng chung logo, tên quán).                                                         |
| Code nằm ở đâu                | Trong `src/features/product-design` (module 12), như một mảng con: dự án dùng nhiều dữ liệu, preflight và luồng gửi duyệt của bản thiết kế, và các feature không được import lẫn nhau.              |
| Ai dựng bộ file khi gửi cả bộ | **Trình duyệt**, như phần A đã quyết cho một bản; sau đó **một lệnh duy nhất** mở lượt duyệt, nên cả bộ vào hàng chờ hoặc không bản nào.                                                            |
| Sao chép file từ thư viện     | **Máy chủ** sao chép (hiện là mock): trình duyệt không tải về rồi tải lên lại.                                                                                                                      |
| Phía người duyệt              | Bảng "Giả lập" của mock thêm phần lượt duyệt dự án; không làm màn hình back-office.                                                                                                                 |

### Thế nào là xong

Trên mock, khách làm được: tạo dự án; tạo bản mới trong dự án hoặc thêm bản sẵn có; tải logo lên
một lần và lưu một mẫu chữ một lần, rồi đặt cả hai lên một ly và một túi của dự án; nhân bản bản
ly sang cỡ kế tiếp và thấy bố cục đã được co giãn sẵn; xem các bản của dự án cạnh nhau; gửi duyệt
cùng lúc ba bản nháp và thấy hoặc cả ba vào hàng chờ, hoặc lý do cụ thể từng bản vì sao không bản
nào được gửi; thấy từng bản được duyệt hay trả lại qua bảng giả lập; đóng dự án. Mọi thứ còn
nguyên sau khi tải lại trang (mock lưu trong IndexedDB).

### Ngoài phạm vi

Báo giá cả dự án (§4.11, BR-21; sau phần D), màn hình duyệt thật của Quản lý kinh doanh, backend
thật, thư viện mẫu có sẵn, nhiều người cùng sửa một bản.

## 2. Quy tắc docs được làm

| Docs                | Quy tắc                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §4.9.27, B42        | Dự án: tên ≤ 200 ký tự, mô tả ≤ 2.000 ký tự (không bắt buộc), tạo ra ở `ACTIVE`; tối đa **20 bản** (không tính bản ARCHIVED).                                                                                                                                                                                            |
| BR-17               | Một chủ sở hữu; chỉ chủ sở hữu thấy và sửa. Một bản thuộc **tối đa một** dự án, chỉ bản của chính chủ sở hữu mới thêm được; bản ARCHIVED không thêm được; bản PENDING_REVIEW không gỡ được. Thêm / gỡ không đổi trạng thái bản. Bản ngoài dự án vẫn chạy đúng như phần A.                                                |
| §4.9.29, BR-18, B43 | Thư viện nhận ảnh kiểm theo **ràng buộc file mặc định** (PNG / JPG / SVG / PDF, ≤ 50 MB — B34), tối đa **30 file**. Đặt ảnh lên một bản là **sao chép** vào bản đó và kiểm lại theo ràng buộc file của **quy cách bản đó**; sai thì không đặt. Xoá mục khỏi thư viện không ảnh hưởng các bản đã dùng nó, kể cả snapshot. |
| §4.9.29             | Bố cục và preflight vẫn riêng từng bản.                                                                                                                                                                                                                                                                                  |
| §4.9.30             | Trang dự án hiện các bản cạnh nhau, có ảnh xem trước và trạng thái.                                                                                                                                                                                                                                                      |
| §4.10, BR-19        | "Gửi duyệt cả bộ": **từ 2 bản DRAFT trở lên** của một dự án **ACTIVE**; preflight từng bản; một bản không đạt → **không gửi bản nào**, báo lỗi từng bản; tất cả đạt → tất cả sang PENDING_REVIEW cùng lúc trong một **lượt duyệt**.                                                                                      |
| §4.10, BR-20        | Trong một lượt, mỗi bản được duyệt hoặc trả lại riêng (BR-06, BR-09, BR-11); "Duyệt tất cả" duyệt lần lượt các bản đang chờ, bản nào không duyệt được thì ở lại PENDING_REVIEW, không chặn các bản khác; lượt tự đóng khi mọi bản đã có quyết định.                                                                      |
| §5.4, BR-22         | `ACTIVE` → `ARCHIVED` (chủ sở hữu đóng) chỉ khi không còn bản PENDING_REVIEW; dự án ARCHIVED không nhận bản mới, không gửi cả bộ, không mở lại; các bản bên trong giữ trạng thái và dùng lẻ được. Bản sửa tạo từ bản thuộc dự án đã đóng không thuộc dự án nào.                                                          |
| §5.3, §5.4          | Lịch sử: bản thiết kế có thêm `ADDED_TO_PROJECT` / `REMOVED_FROM_PROJECT`, `SUBMITTED_FOR_REVIEW` ghi mã lượt duyệt; dự án có `PROJECT_CREATED`, `ASSET_ADDED` / `ASSET_REMOVED`, `PROJECT_ARCHIVED`.                                                                                                                    |

### Giả định (đánh dấu `ASSUMPTION` trong code)

- **A-E1** Mẫu chữ trong thư viện: tối đa **30**, tính riêng với 30 ảnh (docs chỉ cho dùng chung
  ảnh; thư viện chữ là phần mở rộng ở §11).
- **A-E2** Bản thuộc dự án ARCHIVED vẫn **đặt** được mục từ thư viện; không thêm hay xoá gì trong
  thư viện đó (docs chỉ cấm quản lý thư viện).
- **A-E3** Bản nhân bản vào dự án của bản gốc khi dự án đó ACTIVE và còn chỗ; nếu không thì không
  thuộc dự án nào, và khách được báo lý do.
- **A-E4** File tải lên cho một lần gửi cả bộ mà không mở được lượt duyệt sẽ bị máy chủ xoá sau
  24 giờ.

## 3. Dữ liệu

Schema zod đặt trong `schemas.ts` của feature (hoặc `project-schemas.ts` cạnh đó), kiểu suy ra từ
schema:

- **`DesignProject`**: `id`, `name`, `description | null`, `status: "ACTIVE" | "ARCHIVED"`,
  `designCount`, `previewUrls` (tối đa 4, cho dải ảnh ở danh sách), `openRound: { id, designIds,
openedAt } | null`, `createdAt`, `updatedAt`, `version`.
- **`Design.projectId`** (đã có, đến nay luôn `null`) và **`Design.project: { id, name, status } |
null`** cho header studio và nhãn trên thẻ.
- **`LibraryItem`**, phân theo `kind`:
  - `IMAGE`: `id`, `name`, `asset` (đúng dạng `DesignAsset` hiện có: loại file, dung lượng, kích
    thước pixel).
  - `TEXT`: `id`, `name` (nội dung rút gọn), `text` (nội dung) và `style`: phông, cỡ (pt), màu,
    đậm, nghiêng, căn lề, viền (màu, độ dày mm), giãn chữ, giãn dòng — đúng các trường của phần tử
    chữ, nên đặt một mẫu là tạo một phần tử chữ bình thường.
- **`ReviewRound`**: `id`, `projectId`, `designIds`, `openedAt`, `closedAt | null`.
- **Schema đầu vào**: tạo / sửa dự án (tên, mô tả, version), thêm bản, nhân bản (`variantSku` đích,
  tài liệu đã co giãn), gửi cả bộ (mỗi bản: id, version, upload token).

Query key: factory `projectKeys` (`all`, `lists`, `list(params)`, `details`, `detail(id)`,
`library(id)`, `history(id)`), cạnh `designKeys`.

## 4. API (mock phục vụ cho đến khi có backend)

| Endpoint                                                | Mục đích / quy tắc                                                                                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /design-projects?status=&page=&size=`              | Dự án của người gọi, mới cập nhật trước.                                                                                                                                                                                                     |
| `POST /design-projects`                                 | Tạo (tên, mô tả).                                                                                                                                                                                                                            |
| `GET /design-projects/{id}`                             | Một dự án (404 với dự án của khách khác).                                                                                                                                                                                                    |
| `PATCH /design-projects/{id}`                           | Đổi tên / mô tả, kèm `version` (BR-11; 409 khi version cũ).                                                                                                                                                                                  |
| `POST /design-projects/{id}/archive`                    | Kèm `version`; 409 `PROJECT_HAS_PENDING` khi còn bản chờ duyệt (BR-22).                                                                                                                                                                      |
| `GET /design-projects/{id}/designs`                     | Các bản của dự án (bỏ ARCHIVED), đủ thông tin cho thẻ.                                                                                                                                                                                       |
| `POST /design-projects/{id}/designs`                    | Thêm bản sẵn có `{ designId }` (BR-17; 422 kèm mã lý do: `DESIGN_IN_OTHER_PROJECT`, `DESIGN_ARCHIVED`, `PROJECT_FULL`, `PROJECT_ARCHIVED`).                                                                                                  |
| `DELETE /design-projects/{id}/designs/{designId}`       | Gỡ; 409 `DESIGN_PENDING` với bản PENDING_REVIEW.                                                                                                                                                                                             |
| `POST /designs`                                         | Lệnh tạo của phần A, thêm `projectId` không bắt buộc (cùng các kiểm tra như khi thêm).                                                                                                                                                       |
| `GET /design-projects/{id}/library`                     | Ảnh và mẫu chữ.                                                                                                                                                                                                                              |
| `POST /design-projects/{id}/library/images`             | Multipart `file`, khoá chống trùng; ràng buộc file mặc định; 422 `LIBRARY_FULL`.                                                                                                                                                             |
| `POST /design-projects/{id}/library/images/from-design` | `{ designId, assetId }`: sao chép ảnh của một bản vào thư viện.                                                                                                                                                                              |
| `POST /design-projects/{id}/library/texts`              | `{ text, style }`; 422 `LIBRARY_FULL`.                                                                                                                                                                                                       |
| `DELETE /design-projects/{id}/library/{itemId}`         | Không đụng tới các bản đã dùng mục đó (BR-18).                                                                                                                                                                                               |
| `POST /designs/{id}/assets/from-library`                | `{ libraryItemId }` → `DesignAsset` đã sao chép; 422 `FILE_RULE` kèm ràng buộc của quy cách đã từ chối (BR-18).                                                                                                                              |
| `POST /designs/{id}/clones`                             | `{ variantSku, document }`: một bản DRAFT mới cho variant khác của **cùng product** (Active, có cấu hình in), với tài liệu đã co giãn và bản sao các ảnh nó dùng; vào dự án của bản gốc theo A-E3. Ngược lại trả 422 `VARIANT_NOT_ELIGIBLE`. |
| `POST /designs/{id}/submission-uploads`                 | Multipart bộ file của một bản cho lần gửi cả bộ → `{ uploadToken }` (gửi lại không tạo trùng).                                                                                                                                               |
| `POST /design-projects/{id}/review-rounds`              | `{ items: [{ designId, version, uploadToken, preflight, checksums }] }`: tất cả hoặc không (BR-19). 409 `VERSION_CHANGED` nêu tên bản, 422 `PREFLIGHT_FAILED` theo từng bản, 422 `SET_TOO_SMALL`, 409 `PROJECT_ARCHIVED`.                    |
| `GET /design-projects/{id}/history`                     | Sự kiện của dự án, cũ trước.                                                                                                                                                                                                                 |

Mutation làm mới dữ liệu có chủ đích: thay đổi dự án → `projectKeys.detail` / `lists`; thêm, gỡ,
nhân bản, gửi cả bộ → thêm `designKeys.lists` và `detail` của từng bản; thay đổi thư viện →
`projectKeys.library`; đặt từ thư viện → `designKeys.assets(designId)`.

Mock: thêm các module store cạnh `design-store-*.ts` (dự án, thư viện, lượt duyệt), route trong
router mock của design, tất cả lưu IndexedDB; phần giả lập thêm lượt duyệt (§9).

## 5. Màn hình (storefront, mobile-first)

- **"Thiết kế của tôi"** (`/design`) và **"Dự án"** (`/design/projects`): hai link chuyển qua lại
  ở đầu cả hai trang. Thẻ bản thiết kế có nhãn nhỏ ghi tên dự án.
- **Danh sách dự án** (`/design/projects`): tab Đang dùng / Đã đóng và số trang nằm trên URL
  (`nuqs`); thẻ có tên, đoạn mô tả, dải tối đa 4 ảnh xem trước, "N/20 bản", thời gian cập nhật,
  nhãn trạng thái; "Tạo dự án" mở hộp thoại (react-hook-form + zod). Trạng thái rỗng: chưa có dự
  án nào (một câu giải thích dự án để làm gì) và tab Đã đóng trống.
- **Trang dự án** (`/design/projects/[id]`):
  - Đầu trang: tên (sửa tại chỗ), mô tả, trạng thái, "Tạo bản mới trong dự án" (hộp thoại tạo bản
    của phần A, kèm id dự án), "Thêm bản sẵn có" (hộp thoại các bản của khách chưa thuộc dự án nào
    và chưa ARCHIVED), "Đóng dự án" (xác nhận; khoá kèm lý do khi còn bản chờ duyệt).
  - Các bản xếp cạnh nhau: 1 cột trên điện thoại, 2 cột từ `sm`, 3 cột từ `lg`. Thẻ: ảnh xem trước
    2D, quy cách, nhãn trạng thái, lý do trả lại; menu Mở studio, Nhân bản sang cỡ khác, Gỡ khỏi dự
    án (khoá khi PENDING_REVIEW); ô chọn trên bản nháp để gửi cả bộ; "Xem 3D" mở hộp thoại 3D, chỉ
    tải khi bấm (nhiều khung 3D cùng lúc quá nặng; ảnh xem trước 3D lưu sẵn thuộc phần C).
  - Thư viện: tab Ảnh (ô kéo thả, "12/30", lưới ảnh, xoá có xác nhận rằng các bản đã dùng không bị
    ảnh hưởng) và tab Chữ (mẫu chữ hiện đúng phông và màu, xoá). Mẫu chữ chỉ tạo từ studio.
  - Có lượt duyệt đang mở: dải thông báo "N bản đang chờ duyệt cả bộ, gửi lúc …".
  - Dự án ARCHIVED: trang chỉ xem (không thêm, tạo, gửi, tải lên); các bản bên trong vẫn mở và dùng
    lẻ được.
  - Trạng thái: khung chờ, lỗi 5xx / mạng có Thử lại, 404 "Không tìm thấy dự án".

## 6. Studio (chỉ với bản thuộc một dự án)

- **Header**: tên dự án trên tên bản ("Dự án … › …"), là link về trang dự án; nút quay lại về đó.
- **Bảng Ảnh**: "Thư viện dự án" trước (bấm hoặc kéo vào khung vẽ để đặt: máy chủ sao chép, rồi
  `placeImage`; bị từ chối `FILE_RULE` thì hiện ràng buộc của quy cách và không đặt), sau đó "Ảnh
  của bản này" như hiện nay.
- **Bảng Chữ**: "Mẫu chữ của dự án"; bấm vào là đặt một phần tử chữ với nội dung và kiểu đã lưu, giữ
  cỡ đã lưu, tự thu nhỏ cho vừa bề rộng vùng an toàn khi quá rộng.
- **"Thêm" trên thanh ngữ cảnh**: chữ đang chọn → "Lưu thành mẫu chữ của dự án"; ảnh đang chọn →
  "Lưu ảnh vào thư viện dự án" (máy chủ sao chép). Khoá kèm lý do khi thư viện đã đầy hoặc dự án
  ARCHIVED (A-E2).
- Bản chỉ xem không có bảng Ảnh / Chữ: không đặt hay lưu được gì.

## 7. Nhân bản sang cỡ khác

- Nằm trên thẻ bản (trang dự án và "Thiết kế của tôi"), không đặt trong studio. Hộp thoại chỉ liệt
  kê các variant khác của **cùng product**, đang Active và có cấu hình in.
- Trình duyệt co giãn tài liệu bằng một hàm thuần `retargetDocument(document, from: Template, to:
Template): { document, dropped: number }` (trong engine, có test riêng):
  - Mặt in khớp nhau theo mã vùng in; phần tử ở mã mà quy cách đích không có thì bỏ và đếm.
  - **Vùng chữ nhật** (mặt túi): mỗi phần tử giữ tâm tương đối trong vùng; kích thước, cỡ chữ và
    độ dày nét nhân với `s = min(wĐích / wGốc, hĐích / hGốc)`.
  - **Vùng hình quạt** (thân ly): mỗi phần tử giữ **tỉ lệ góc** trong hình quạt và **tỉ lệ bán
    kính** trong dải in; kích thước nhân theo tỉ lệ chiều cao dải in; nét vẽ được đổi từng điểm
    bằng cùng phép biến đổi.
  - Nền chép nguyên.
- Một lệnh `POST /designs/{id}/clones` tạo bản nháp với tài liệu đã co giãn và bản sao các ảnh nó
  dùng; studio của bản mới mở ra với preflight đã hiện (logo nét trên ly 500 ml có thể thiếu dpi
  trên ly 700 ml). Hộp thoại báo số phần tử bị bỏ và, theo A-E3, lý do nếu bản mới không vào dự
  án.

## 8. Gửi duyệt cả bộ

- **Chọn bản**: ô chọn trên các bản nháp của dự án; thanh dính dưới cùng "Đã chọn N bản nháp" với
  "Gửi duyệt cả bộ", khoá kèm lý do khi chưa đủ 2 bản hoặc dự án ARCHIVED.
- **Hộp thoại**, mỗi bản một dòng (tên, quy cách, trạng thái):
  1. **Kiểm tra**: preflight từng bản chạy nền trên đúng dữ liệu đã lưu (tài liệu, khuôn, phông,
     ảnh — tải mà không cần mở studio). Có bản không đạt: dừng; không gửi gì; dòng lỗi ghi lỗi cụ
     thể kèm "Mở studio để sửa"; mỗi lần không đạt được ghi vào lịch sử bản đó như phần A.
  2. **Xác nhận**: "N bản đều đạt", kèm lưu ý preflight (ví dụ CMYK).
  3. **Dựng và tải lên** lần lượt từng bản: bộ file (ảnh xem trước PNG, PDF in, PDF đặc tả) với
     thanh tiến độ mỗi dòng, rồi `submission-uploads`; giải phóng bộ nhớ giữa các bản; cảnh báo
     `beforeunload` khi đang chạy; lỗi mạng có "Thử lại", chạy tiếp từ chỗ dở (khoá chống trùng,
     không tạo bản trùng). Hủy được đến trước bước 4, khi đó không gửi gì.
  4. **Mở lượt duyệt**: một lệnh `POST …/review-rounds`. Một bản bị sửa giữa chừng (BR-11) làm cả
     lượt bị từ chối và nêu tên bản đó; thành công thì mọi bản sang PENDING_REVIEW cùng lúc và
     trang hiện dải lượt duyệt.
- **Bộ chạy dùng chung**: các bước "kiểm tra → dựng → tải lên" hiện gắn với studio
  (`submission-checks.ts`, `use-design-submission.ts`) được tách thành một bộ chạy tự tải một bản.
  Nút "Gửi duyệt" của studio dùng cùng bộ chạy với trạng thái đang có; hành vi và test của nó giữ
  nguyên.

## 9. Giả lập ("Giả lập")

Mục "Lượt duyệt dự án": các lượt đang mở cùng các bản, Duyệt / Trả lại (kèm lý do) từng bản, "Duyệt
tất cả" (lần lượt), và cách làm một lần duyệt bị lỗi (BR-09) để bản đó ở lại PENDING_REVIEW trong
khi các bản khác được duyệt. Lượt tự đóng ở quyết định cuối. Bản bị trả lại về DRAFT, gửi lại lẻ
hoặc trong lượt mới được.

## 10. Lỗi và trạng thái

Mọi route: khung chờ đúng hình bố cục, tải lại nền không chặn trang, rỗng (chưa có gì) khác rỗng
(do lọc), lỗi 4xx kèm cách khắc phục (các mã lý do ở §4 viết bằng tiếng Việt), 5xx / mạng có thử
lại, lỗi parse zod coi là lỗi hợp đồng API, mutation đang chạy thì khoá nút.

## 11. Mở rộng docs (ghi lại cho người phụ trách docs)

- **Nhân bản sang cỡ khác** (§7): docs không có; là tiện ích nằm trong BR-01/BR-02 (mỗi bản vẫn một
  variant).
- **Mẫu chữ dùng chung** trong thư viện dự án (§6, A-E1): docs chỉ cho dùng chung ảnh và logo.

## 12. Test

- `retargetDocument`: túi và ly, nhỏ → lớn và lớn → nhỏ, vùng in mà đích không có, nét vẽ, nền.
- Schema và quy tắc: giới hạn (20 bản, 30 ảnh, 30 mẫu chữ, độ dài), thêm / gỡ theo BR-17, đóng theo
  BR-22, khoá khi ARCHIVED — viết thành hàm thuần ở chỗ là quy tắc khoá giao diện.
- Mock store: dự án, sao chép từ thư viện (BR-18, ràng buộc file của quy cách), nhân bản, lượt duyệt
  (tất cả hoặc không, version đổi, tự đóng), lưu trữ.
- Gửi cả bộ (RTL + mock): một bản không đạt → không gửi bản nào, lỗi từng dòng; một bản đổi version
  → cả lượt bị từ chối; thử lại sau lỗi mạng; thành công → tất cả PENDING_REVIEW.
- Giả lập: "Duyệt tất cả" có một bản duyệt lỗi; lượt tự đóng.
- Màn hình: danh sách, trang dự án (cạnh nhau, chọn bản, ARCHIVED chỉ xem, các trạng thái), thư viện
  và mẫu chữ trong studio, hộp thoại nhân bản; gửi lẻ trong studio không đổi.
