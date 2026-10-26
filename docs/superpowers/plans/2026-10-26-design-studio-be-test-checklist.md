# Checklist test Design Studio với BE thật

- Ngày lập: 2026-10-26. Nhánh FE: `feat/design-studio-3d`.
- BE đối chiếu: `origin/develop` @ `92bcd760` (2026-10-24). Lúc test, ghi lại commit BE đang chạy.
- Tài liệu liên quan: spec [`2026-10-25-design-studio-3d-design.md`](../specs/2026-10-25-design-studio-3d-design.md),
  đề xuất API cho BE [`2026-10-25-design-api-be-proposal.md`](../specs/2026-10-25-design-api-be-proposal.md).

Cách dùng: mỗi mục có mã (vd. `A-03`). Khi chạy, ghi kết quả vào bảng ở §9: ✅ đạt, ❌ lỗi, ⏭ bỏ qua (nêu lý do).
Mục ❌ cần kèm bằng chứng: ảnh chụp, request/response trong tab Network, log console.

---

## 0. Chuẩn bị (bắt buộc trước khi test)

| Mã   | Việc                                                                                                                                                   | Ai làm |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| P-01 | Env: `API_URL` trỏ đúng BE, `USE_MOCK` khác `true`. Mình không đọc `.env`, bạn xác nhận giúp.                                                          | Bạn    |
| P-02 | Khởi động dev server, log không có `Failed to proxy … ENOTFOUND`. Ngày 26/10 env đang trỏ `api.hoaiphuong.io.vn` và tên miền này không phân giải được. | Mình   |
| P-03 | Ghi commit BE đang deploy và kiểm tra BE đã có P1–P6 chưa (xem §6). Có → chạy nhánh B; chưa → chỉ chạy nhánh A.                                        | Mình   |
| P-04 | Tài khoản test: 1 khách hàng, 1 Sales (`design-administration` + `designs:UPDATE`), 1 QC (`designs:APPROVE`).                                          | Bạn    |
| P-05 | Đăng nhập: **bạn tự đăng nhập** trong trình duyệt. Mật khẩu sẽ đi tới host BE bên ngoài nên mình không nhập.                                           | Bạn    |
| P-06 | Dữ liệu: ít nhất 1 ly (12oz) và 1 túi kraft có `customization_template` đang active, đủ print areas, có SKU.                                           | Bạn/BE |
| P-07 | Trình duyệt: Chrome desktop, cửa sổ ≥ 1280 px, DevTools mở tab Network, bật "Disable cache".                                                           | Mình   |
| P-08 | Ghi lại commit FE đang test (`git rev-parse HEAD`).                                                                                                    | Mình   |

---

## 1. Kết nối và hợp đồng dữ liệu (contract)

FE parse mọi response bằng zod ngay tại `api.ts`. Lỗi parse là lỗi hợp đồng, phải ghi lại kèm body.

| Mã   | Kiểm tra                                                                                                                 | Kỳ vọng                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| C-01 | `GET /api/v1/designs?page=0&size=12` với tài khoản khách                                                                 | 200; danh sách parse được; console không có lỗi zod/contract                |
| C-02 | `GET /designs/{id}` ở từng trạng thái `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`                                       | Parse được. Status nằm ngoài 4 giá trị này là lỗi hợp đồng: ghi lại giá trị |
| C-03 | Các field `technicalReviewPassed`, `reviewNotes`, `version`, `updatedAt`, `currentArtifactId`, `ownerUserId` (dạng UUID) | Có mặt và đúng kiểu; ghi lại field thiếu hoặc khác tên                      |
| C-04 | `GET /designs/{id}/history?page=0`                                                                                       | 200, các mục quyết định parse được                                          |
| C-05 | `GET /designs/{id}/snapshot` với design đã chốt                                                                          | 200; có snapshot id và checksum                                             |
| C-06 | `GET /designs/{id}/artifacts` và `GET …/artifacts/{artifactId}/download-url`                                             | 200; `url` + `expiresAt`                                                    |
| C-07 | Trình duyệt `fetch` URL presigned của artifact (ảnh xem trước)                                                           | Tải được, **không lỗi CORS**. Có lỗi CORS → báo BE (đề xuất §CORS)          |
| C-08 | Catalog: `GET /catalog/products/{slug}` của sản phẩm ly/túi                                                              | Không có `kind` (G3) → trang vẫn mở, **không** có nút "Thiết kế"            |
| C-09 | Phong bì lỗi: 400 `VALIDATION_FAILED` có `fieldErrors`, 401, 403, 404, 409, 422, 5xx                                     | Đúng dạng `ApiError`, UI hiện thông báo tiếng Việt tương ứng (xem §5.4)     |
| C-10 | Token hết hạn khi đang ở `/design/{id}`                                                                                  | Refresh hoặc chuyển về đăng nhập; không trắng trang                         |

---

## 2. Chỉ hỗ trợ desktop (máy tính, cửa sổ ≥ 1024 px)

| Mã   | Kiểm tra                                                         | Kỳ vọng                                                                                                     |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D-01 | Mở `/design/new?product=…` và `/design/{id}` ở 375, 768, 1023 px | Thông báo "Chức năng thiết kế chỉ hỗ trợ trên máy tính"; studio không tải (Network không có chunk three.js) |
| D-02 | Cùng các trang trên máy tính ở 1024, 1280, 1920 px               | Studio mở bình thường                                                                                       |
| D-07 | iPad (dọc và ngang, cả iPad Pro 1366 px), máy tính bảng Android  | Thông báo desktop-only ở mọi hướng xoay                                                                     |
| D-08 | Laptop cảm ứng (Windows, có touchpad)                            | Studio mở; pinch zoom và vẽ một ngón vẫn dùng được                                                          |
| D-03 | Đang sửa ở 1280 px, thu cửa sổ còn 800 px rồi mở rộng lại        | Hiện thông báo khi hẹp; khi rộng lại thì nội dung đang sửa vẫn còn, không mất chỉnh sửa                     |
| D-04 | Nút "Sao chép liên kết"                                          | Clipboard có đúng URL hiện tại; nút đổi thành "Đã sao chép liên kết"                                        |
| D-05 | Link "Thiết kế của tôi" trên thông báo                           | Về `/design`                                                                                                |
| D-06 | `/design` (danh sách) trên điện thoại                            | Vẫn xem được; bấm vào thẻ → thông báo desktop-only                                                          |

---

## 3. Danh sách "Thiết kế của tôi" (`/design`)

| Mã   | Kiểm tra                           | Kỳ vọng                                                                                   |
| ---- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| L-01 | Chưa đăng nhập                     | BE trả 401 → về trang đăng nhập hoặc báo cần đăng nhập; không treo ở skeleton             |
| L-02 | Khách chưa có thiết kế nào         | Chưa có P1: "Sales của StockFlow lên thiết kế…" + "Nhắn Sales" (`/chat`) + "Xem sản phẩm" |
| L-03 | Khách có thiết kế                  | Chỉ thấy thiết kế của mình; badge trạng thái đúng; thời gian theo giờ Việt Nam            |
| L-04 | Thẻ có artifact `CUSTOMER_PREVIEW` | Thumbnail hiện qua download-url (cần C-07 đạt)                                            |
| L-05 | Phân trang khi có > 12 thiết kế    | Trang 2 đúng; URL giữ `page`                                                              |
| L-06 | Các tab lọc trạng thái             | Không hiện khi BE chưa có P6 (`statusFilter` tắt)                                         |
| L-07 | BE trả 5xx / mất mạng              | Thông báo lỗi + nút "Thử lại"                                                             |

---

## 4. Từ trang sản phẩm vào thiết kế

| Mã   | Kiểm tra                                                     | Kỳ vọng (BE như develop)                                                                      |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| F-01 | PDP sản phẩm ly/túi                                          | Không có nút "Thiết kế", vì catalog chưa trả `kind`. Thêm vào giỏ vẫn chạy                    |
| F-02 | Gõ thẳng `/design/new?product=<slug>` (kể cả chưa đăng nhập) | "Thiết kế trực tuyến chưa mở" + "Nhắn Sales" (`/chat`) + "Quay lại sản phẩm"; không gọi P1/P2 |
| F-03 | `/design/new` thiếu `product`                                | Chưa có P1: như F-02, nút phụ là "Xem sản phẩm"                                               |

---

## 5. Nhánh A: BE như `develop` (màn chỉ-quy-trình)

Khi P3/P4 chưa có, hoặc design thiếu `sku`/`templateCode`, `/design/{id}` hiện màn chỉ-quy-trình (R72): không có
editor/3D, chỉ có trạng thái, ghi chú QC, ảnh xem trước, lịch sử và các nút quy trình.

### 5.1 Dựng dữ liệu bằng tài khoản Sales/QC (qua backoffice hoặc API)

| Mã   | Bước                                                                     | Kỳ vọng ở storefront (tài khoản khách)                                                               |
| ---- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A-01 | Sales `POST /designs` tạo design cho khách, gán người phụ trách          | Khách thấy design trong `/design`, trạng thái "Đang thiết kế"                                        |
| A-02 | Khách mở `/design/{id}`                                                  | Màn chỉ-quy-trình: tên, badge, gợi ý, ghi chú "chỉnh sửa cần backend hỗ trợ"; không lỗi console      |
| A-03 | Sales upload artifact `CUSTOMER_PREVIEW` (PNG)                           | Trong ≤ 10 s (poll 5 s khi đang chờ) hoặc sau reload, ảnh xem trước hiện; xoá cache vẫn tải lại được |
| A-04 | Sales `PUT /specification` rồi `POST /confirmation-requests` (SUBMITTED) | Badge "Chờ bạn xác nhận"; hiện "Xác nhận thiết kế", "Yêu cầu sửa", "Rút yêu cầu"                     |
| A-05 | QC `POST /technical-reviews` đạt, có ghi chú                             | Hiện kết quả kiểm tra và ghi chú QC                                                                  |
| A-06 | QC `POST /technical-reviews` không đạt, có ghi chú                       | Trạng thái và ghi chú hiện đúng; không cho xác nhận nếu BE chặn                                      |

### 5.2 Thao tác của khách

| Mã   | Thao tác                                             | Kỳ vọng                                                                                                   |
| ---- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A-07 | "Xác nhận thiết kế" khi có cảnh báo preflight        | Phải tick "Tôi đã xem các cảnh báo và chấp nhận rủi ro khi in" mới bấm được "Xác nhận chốt"               |
| A-08 | Xác nhận thành công                                  | `POST /confirmations` → 200; badge "Đã chốt"; mã bản chốt hiện; có "Yêu cầu báo giá", "Tạo phiên bản mới" |
| A-09 | Bấm đúp nhanh nút xác nhận                           | Chỉ 1 request (nút khoá khi đang gửi)                                                                     |
| A-10 | "Yêu cầu sửa": lý do trống / quá 2000 ký tự / hợp lệ | Trống và quá dài bị chặn ở form; hợp lệ → về `DRAFT`, lý do hiện như ghi chú                              |
| A-11 | "Rút yêu cầu"                                        | `POST /confirmation-withdrawals` → về trạng thái chỉnh sửa                                                |
| A-12 | "Tạo phiên bản mới" trên design đã chốt              | `POST /revisions` → chuyển sang design mới; design cũ vẫn mở được                                         |
| A-13 | "Yêu cầu báo giá"                                    | Mở Sales chat (`/chat`); khách gửi kèm được mã bản chốt                                                   |
| A-14 | Lịch sử quyết định                                   | Đủ các bước A-04…A-12, đúng thứ tự và giờ                                                                 |

### 5.3 Đồng thời và quyền

| Mã   | Tình huống                                                                     | Kỳ vọng                                                                |
| ---- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| A-15 | Khách đang mở dialog xác nhận, Sales rút/sửa ở tab khác rồi khách bấm xác nhận | 409 hiện ngay trong dialog, design tự tải lại (R68); không mất dữ liệu |
| A-16 | Khách mở `/design/{id}` của khách khác                                         | 403/404 → màn "Không tìm thấy thiết kế" + link về "Thiết kế của tôi"   |
| A-17 | Khách gọi endpoint chỉ dành cho Sales (vd. `POST /designs`)                    | 403; UI không có lối gọi                                               |
| A-18 | Id sai định dạng / có `%`                                                      | Trang lỗi gọn, không crash                                             |

### 5.4 Lỗi mạng và máy chủ

| Mã   | Tình huống                                     | Kỳ vọng                                               |
| ---- | ---------------------------------------------- | ----------------------------------------------------- |
| A-19 | Tắt mạng (DevTools Offline) khi đang mở design | Thông báo mất kết nối; bật lại thì tự lấy lại dữ liệu |
| A-20 | BE trả 5xx                                     | "Không mở được trình thiết kế…" + "Thử lại"           |
| A-21 | URL presigned hết hạn (sau 5 phút)             | Ảnh xem trước lấy link mới, không vỡ ảnh vĩnh viễn    |

---

## 6. Nhánh B: BE đã có P1–P6

Khi BE có endpoint nào thì bật cờ tương ứng trong `src/features/product-design/capabilities.ts` →
`PROPOSED_ENDPOINTS_LIVE`, rồi chạy nhóm test của endpoint đó. Bật từng cờ một.

| Cờ              | Endpoint                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| `selfService`   | P1 `POST /designs/mine` (+ P2 `GET /catalog/products/{slug}/customization`, `kind`)       |
| `document`      | P3 `GET/PUT /designs/{id}/document`                                                       |
| `assets`        | P4 `GET/POST /designs/{id}/assets`, `…/assets/{assetId}/download-url`                     |
| `reviewRequest` | P5 `POST /designs/{id}/technical-review-requests`                                         |
| `statusFilter`  | P6 `status` filter trên `GET /designs` (+ `productSlug`, `sku`, `templateCode` trong DTO) |

### 6.1 P1/P2: khách tự tạo thiết kế

| Mã   | Kiểm tra                                                       | Kỳ vọng                                                                                            |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| B-01 | PDP ly/túi có `kind=CUSTOMIZABLE`                              | Có nút "Thiết kế", link mang theo SKU đang chọn                                                    |
| B-02 | Launcher: chọn template, tên mặc định "{tên template} – dd/MM" | `POST /designs/mine` → 201 → vào studio                                                            |
| B-03 | Template có `minDpi`, `allowedFileFormats`, danh sách font     | Đổ đúng vào preflight (đuôi file không phân biệt hoa thường; danh sách font rỗng = không giới hạn) |
| B-04 | Template bị tắt sau khi design đã tạo                          | Design cũ vẫn mở được (đề xuất §inactive template)                                                 |

### 6.2 P3: lưu document

| Mã   | Kiểm tra                                                 | Kỳ vọng                                                                       |
| ---- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| B-05 | Sửa rồi chờ 1,5 s                                        | 1 `PUT /document` với `version`; header "Đã lưu hh:mm"                        |
| B-06 | **Reload trang** (tiêu chí 6, chưa kiểm chứng trên mock) | Thiết kế mở lại y như trước reload                                            |
| B-07 | Mở cùng design ở 2 tab, sửa cả hai                       | Tab sau gặp 409 → hộp xung đột "Tải lại"; không ghi đè im lặng                |
| B-08 | Document sai schema (dùng DevTools sửa body)             | 400 `VALIDATION_FAILED`, field `document`; UI báo lỗi, không mất bản đang sửa |
| B-09 | Document vượt 1 MB (nhiều nét vẽ)                        | Lưu bị từ chối, trạng thái lỗi rõ ràng; giảm nội dung thì lưu lại được        |
| B-10 | Offline khi đang sửa, rồi bấm "Thiết kế của tôi"         | Hỏi "Thay đổi chưa được lưu…"; mở lại thì có "Khôi phục bản chưa lưu"         |
| B-11 | QC đổi trạng thái giữa hai lần lưu                       | Lần lưu sau không bật hộp xung đột (R69: checksum khớp thì nhận version mới)  |

### 6.3 P4: ảnh/logo của khách

| Mã   | Kiểm tra                                         | Kỳ vọng                                                                                                      |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| B-12 | Upload PNG, JPG, WEBP < 20 MB                    | 201; ảnh hiện trên khung vẽ và 3D; reload vẫn còn                                                            |
| B-13 | Upload GIF/PDF hoặc file > 20 MB                 | 415 / 413 với thông báo tiếng Việt                                                                           |
| B-14 | Mất mạng giữa chừng rồi thử lại                  | Cùng `Idempotency-Key` → không tạo ảnh trùng                                                                 |
| B-15 | Ảnh chụp dọc từ điện thoại (có EXIF orientation) | Không bị xoay/méo; `widthPx`/`heightPx` khớp ảnh đã xoay; DPI đúng                                           |
| B-16 | Ảnh độ phân giải thấp đặt to                     | Preflight: Fail khi DPI < `minDpi`, Warning khi DPI < max(`minDpi`, 300) — DPI của file in (BA còn xác nhận) |
| B-17 | URL presigned của ảnh                            | Fetch được, không lỗi CORS                                                                                   |

### 6.4 P5: gửi QC và xác nhận

| Mã   | Kiểm tra                                      | Kỳ vọng                                                                                                                                                                             |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-18 | "Gửi QC kiểm tra" khi preflight có Fail       | Bị chặn, chỉ rõ lỗi                                                                                                                                                                 |
| B-19 | "Gửi QC kiểm tra" khi Pass/Warning            | Upload `CUSTOMER_PREVIEW` (ảnh 3D 1600²), `TECHNICAL_SPEC`, PDF in; `PUT /specification` ≤ 4000 ký tự; `POST technical-review-requests`                                             |
| B-20 | Sửa khi đang chờ QC → bấm "Huỷ" trong hộp hỏi | Document về đúng bản trước khi sửa. **Lỗi N1**: chờ ≥ 5 s cho trang tự làm mới rồi làm lại lần hai, xem có quay về bản sửa đã bỏ không                                              |
| B-21 | Sửa khi đang chờ QC → "Tiếp tục chỉnh sửa"    | Yêu cầu QC bị huỷ; trạng thái về đang thiết kế                                                                                                                                      |
| B-22 | PDF in: mở bằng Acrobat                       | Đúng khổ + bleed; đường cắt spot `CutContour`; ảnh ≥ 300 DPI; đường cắt overprint (Output Preview của Acrobat); túi L không lộ đường chỉ giữa các băng (các băng chồng nhau 1 hàng) |
| B-23 | Checksum trong spec và snapshot               | Trùng với checksum document đã lưu                                                                                                                                                  |

### 6.5 P6

| Mã   | Kiểm tra                   | Kỳ vọng                             |
| ---- | -------------------------- | ----------------------------------- |
| B-24 | Tab trạng thái ở `/design` | URL giữ tab; đổi tab thì về trang 1 |
| B-25 | DTO có `productSlug`       | Studio hiện ảnh sản phẩm thật       |

---

## 7. Studio trên desktop (chạy khi nhánh B mở được editor)

| Mã   | Kiểm tra                                                               | Kỳ vọng                                                  |
| ---- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| S-01 | Tải studio lần đầu (Fast 3G tắt, máy văn phòng)                        | Có skeleton; dùng được trong vài giây; không lỗi console |
| S-02 | Công cụ Chọn, Ảnh, Chữ (gõ Telex tiếng Việt), Vẽ tay, Tẩy, Nền/pattern | Hoạt động; undo/redo đúng từng thao tác                  |
| S-03 | Chữ uốn quanh ly, đổi mặt túi, "Sao chép sang mặt khác"                | Hiển thị đúng ở 2D và 3D                                 |
| S-04 | Bấm vào mô hình 3D                                                     | Chọn đúng mặt/phần tử                                    |
| S-05 | Laptop cảm ứng                                                         | Pinch zoom/pan; một ngón vẽ khi dùng cọ                  |
| S-06 | Mất WebGL (`chrome://gpuclean`)                                        | Chuyển sang xem trước phẳng, không trắng                 |
| S-07 | Sửa liên tục 10 phút                                                   | Bộ nhớ tab không tăng mãi (DevTools Memory)              |

---

## 8. Trình duyệt

| Mã   | Trình duyệt      | Ghi chú                     |
| ---- | ---------------- | --------------------------- |
| W-01 | Chrome (Windows) | Chạy toàn bộ                |
| W-02 | Edge (Windows)   | Nhánh A + D-01…D-08         |
| W-03 | Firefox          | Nhánh A + S-02              |
| W-04 | Safari macOS     | Nhánh A + S-02, B-22        |
| W-05 | Safari iPad      | Chỉ kiểm tra D-07 (bị chặn) |

---

## 9. Bảng kết quả

### Lần chạy 1: 2026-10-26, khoảng 16:15–16:25

- FE: `2147238` + thay đổi chưa commit (desktop-only gate, chặn máy tính bảng).
- BE: `origin/develop` @ `92bcd760` (fetch lúc chạy, không có commit mới), chưa có P1–P6 → chạy nhánh A.
- Trình duyệt: khung Browser của Claude (Chromium 152, Windows), 1440×900 và giả lập Android 375×812.
- Tài khoản: 1 khách hàng do bạn đăng nhập. Tài khoản này chưa có thiết kế nào; chưa có tài khoản Sales/QC.

| Mã         | Kết quả     | Ghi chú / bằng chứng                                                                                                                                                                    |
| ---------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01       | ✅          | Bạn xác nhận env đã trỏ đúng BE                                                                                                                                                         |
| P-02       | ✅          | Log dev server không còn `Failed to proxy`; chưa đăng nhập thì `/api/designs` → 401 `UNAUTHORIZED` đúng chuẩn                                                                           |
| P-03       | ✅          | `develop` @ `92bcd760`, không có `designs/mine`, `customization`, `document`, `assets`, `technical-review-requests` → nhánh A                                                           |
| P-04       | ⚠️          | Chỉ có tài khoản khách; thiếu Sales và QC nên chưa dựng được dữ liệu cho §5                                                                                                             |
| P-05       | ✅          | Bạn đăng nhập; `POST /identity/auth/login` 200, `/identity/me` 200, `/customers/me` 200                                                                                                 |
| P-06       | ⏭           | Không kiểm được qua API (chưa có P2); cần BE xác nhận template của `lyg-2l`, `tui-kraft`                                                                                                |
| P-07, P-08 | ✅          | Như phần đầu lần chạy                                                                                                                                                                   |
| C-01       | ⚠️          | 200 `{"items":[],"totalElements":0}` parse được; chưa kiểm được hình dạng một item vì danh sách trống                                                                                   |
| C-02…C-07  | ⏭           | Cần design thật (Sales tạo)                                                                                                                                                             |
| C-08       | ✅          | `GET /catalog/products/lyg-2l` không có `kind`; PDP mở bình thường                                                                                                                      |
| C-09       | ✅ một phần | 400 `REQUEST_REJECTED`, 401 `UNAUTHORIZED`, 404 `NOT_FOUND` đều đúng phong bì (`success`, `errorCode`, `message`, `correlationId`); 409/422 chưa gặp                                    |
| C-10       | ⏭           | Chưa đợi token hết hạn                                                                                                                                                                  |
| D-01       | ✅          | 375 px (Android): thông báo hiện; không có request `/api/designs/{id}`; chỉ tải stub loader 1 KB, không tải code studio, three.js, pdf-lib. 768/1023 px: unit test                      |
| D-02       | ✅          | 1280 và 1440 px: launcher hiện bình thường                                                                                                                                              |
| D-03       | ✅          | Kiểm ở chế độ mock: thêm chữ ở 1280 → thu 800 → mở 1280, chữ còn và đã tự lưu                                                                                                           |
| D-04, D-05 | ✅          | Unit test (`desktop-only-gate.test.tsx`)                                                                                                                                                |
| D-06       | ✅ một phần | `/design` ở 375 px hiển thị đúng, không cuộn ngang; bấm thẻ chưa thử vì không có thiết kế                                                                                               |
| D-07       | ⏭           | Không giả lập được iPad trong khung Browser; đã có unit test cho iPad (UA "Macintosh" + điểm chạm), Android tablet, màn cảm ứng không hover                                             |
| D-08       | ⏭           | Không có laptop cảm ứng                                                                                                                                                                 |
| L-01       | ✅          | Chưa đăng nhập: `/design` chuyển sang `/login?next=%2Fdesign`                                                                                                                           |
| L-02       | ❌          | Trạng thái trống hiện, nhưng hướng dẫn "Chọn một sản phẩm in được và bấm “Bắt đầu thiết kế”" là ngõ cụt với BE thật: PDP không có nút này (thiếu `kind`, chưa có P1). Xem lỗi **R1-01** |
| L-03…L-05  | ⏭           | Cần design thật                                                                                                                                                                         |
| L-06       | ✅          | Không có tab trạng thái (P6 tắt)                                                                                                                                                        |
| L-07       | ⏭           | Chưa giả lập 5xx cho trang danh sách                                                                                                                                                    |
| F-01       | ✅          | PDP `lyg-2l`: không có nút "Thiết kế"; "Thêm vào giỏ" vẫn có                                                                                                                            |
| F-02       | ✅          | `/design/new?product=lyg-2l&sku=LYG-2L-12OZ`: "Tính năng này đang chờ backend hỗ trợ" + "Quay lại sản phẩm"; không có request P1/P2                                                     |
| F-03       | ✅          | `/design/new`: "Chưa chọn sản phẩm để thiết kế" + "Xem sản phẩm" (câu chữ cùng vấn đề R1-01)                                                                                            |
| A-01…A-15  | ⏭           | **Bị chặn**: khách chưa có design; cần Sales tạo design cho khách này (và QC duyệt) trước                                                                                               |
| A-16       | ✅          | Id không tồn tại: 404 `NOT_FOUND` → "Không tìm thấy thiết kế" + "Về thiết kế của tôi"; trường hợp design của khách khác chưa thử                                                        |
| A-17       | ⏭           | Không gửi `POST /designs` bằng tài khoản khách (thao tác ghi)                                                                                                                           |
| A-18       | ✅          | Id `not-a-uuid%zz`: 400 `REQUEST_REJECTED` → "Không mở được trình thiết kế… (Mã tra cứu: …)", không crash. Góp ý **R1-02**                                                              |
| A-19, A-21 | ⏭           | Cần design thật                                                                                                                                                                         |
| A-20       | ✅          | Lúc env còn trỏ tên miền không phân giải được: proxy 500 → "Không mở được trình thiết kế. Hệ thống đang gặp sự cố…" + "Thử lại"                                                         |
| B-\*, S-\* | ⏭           | BE chưa có P1–P6                                                                                                                                                                        |

### Lỗi và góp ý phát hiện

- **R1-01 (cần sửa, FE):** với BE thật, 7 lối vào thiết kế (menu "Thiết kế riêng", "Mở thiết kế của tôi", "Thiết kế ngay",
  "Bắt đầu thiết kế", "Dịch vụ thiết kế"…) đều tới `/design`. Trạng thái trống ở đó và màn `/design/new` bảo khách "mở sản
  phẩm và bấm Bắt đầu thiết kế", nhưng PDP không có nút này. Khách bị vòng lặp. Hướng sửa: khi `selfService` tắt, trạng thái
  trống nói rõ thiết kế do Sales của StockFlow tạo cho khách và dẫn tới Sales chat (`/chat`); câu ở `/design/new` cũng vậy.
  **Đã sửa**, kiểm lại ở lần chạy 2.
- **R1-02 (nhỏ, FE):** id không phải UUID vẫn gọi BE rồi hiện lỗi chung kèm nút "Thử lại" (thử lại cũng vô ích). Nên coi
  400/id sai định dạng như "Không tìm thấy thiết kế".

### Lần chạy 2: 2026-10-26, khoảng 16:40 (kiểm lại R1-01)

Server tạm ép `USE_MOCK=false`, cùng BE và cùng tài khoản khách như lần chạy 1.

| Mã   | Kết quả | Ghi chú / bằng chứng                                                                                                                                                      |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L-02 | ✅      | "Bạn chưa có thiết kế nào" + "Sales của StockFlow lên thiết kế theo yêu cầu của bạn…"; "Nhắn Sales" → `/chat` (bấm thử, trang Sales Chat mở), "Xem sản phẩm" → `/catalog` |
| F-02 | ✅      | `/design/new?product=lyg-2l&sku=LYG-2L-12OZ`: "Thiết kế trực tuyến chưa mở" + "Nhắn Sales" → `/chat` + "Quay lại sản phẩm" → `/catalog/products/lyg-2l`                   |
| F-03 | ✅      | `/design/new`: "Thiết kế trực tuyến chưa mở" + "Nhắn Sales" → `/chat` + "Xem sản phẩm" → `/catalog`                                                                       |
