# Đối chiếu API design của BE (develop 14/11) với storefront và back-office

Ngày: 2026-11-15. BE: `origin/develop` tại `85e6036a` (14/11). Storefront: nhánh `feat/design-m12-a-foundation`
(`eac4744`). Back-office: nhánh `feat/product-design-print-config` (`e0f59a9b`).

Cách làm: chỉ đọc code, không chạy BE. Mỗi kết luận trong hai phụ lục có kèm vị trí file và dòng ở cả hai phía.
Phần D (SKU riêng, yêu cầu báo giá) và gói kiểu Canva không đối chiếu, theo yêu cầu.

- Phụ lục 1, storefront với BE (tiếng Anh, bảng kỹ thuật): `2026-11-15-phu-luc-storefront-vs-be.md`
- Phụ lục 2, back-office với BE (tiếng Anh, bảng kỹ thuật): `2026-11-15-phu-luc-backoffice-vs-be.md`

## 1. Kết luận

- **BE đã làm gần hết những gì mình yêu cầu ngày 13/11.** Trong 16 mục, 15 mục đã có (một số làm khác chi tiết),
  chỉ **B-6** chưa làm. Trong 6 endpoint storefront cần mà BE thiếu hôm 13/11, nay đã có 5; cái còn lại
  (`draft-count`) storefront tự suy ra được.
- **Chưa FE nào chạy được thẳng với BE.** Phần việc còn lại chủ yếu nằm ở FE: đổi đường dẫn, đổi tên trường, đổi
  luồng gửi duyệt, đổi cách đọc lỗi. Phần lớn những chỗ lệch này FE đã dự kiến tự chuyển đổi từ hôm 13/11.
- **Điều kiện của việc tách chưa được bảo đảm.** BE vẫn lưu số đo và file `.glb` bằng hai request riêng, và không
  chặn việc sửa số đo mà không kèm file. Vậy số đo và file vẫn có thể lệch nhau, mà storefront không còn tự kiểm.
  Cần gửi lại BE mục B-6.

## 2. Các mục đã yêu cầu BE

| Mục | Nội dung | Tình hình ở BE |
|---|---|---|
| A-1 | Ảnh xem trước, tên biến thể, tên sản phẩm trên thiết kế | Xong |
| A-2 | Cờ `hasCartonSpec` trong dữ liệu tuỳ biến của sản phẩm | Xong |
| A-3 | Ghi lại lần preflight hỏng ở trình duyệt | Xong, khác chi tiết: khoá là `rule`; nội dung `message` bị bỏ qua |
| B-1 | Tải, quét, lưu file `.glb` | Xong nhưng **vẫn là request riêng** `PUT …/model-file`; file không qua quét trả 400 thay vì 422; chưa có cách gỡ file đã gắn |
| B-2 | Bảng ghép vùng in ↔ mesh | Làm một phần: chưa bắt buộc ghép đủ mọi vùng in, chưa bắt tên đúng dạng `print:<mã>` |
| B-3 | Storefront nhận link file `.glb` | Xong: `{url, surfaces}` nằm trong từng template, link ký hạn 1 giờ; không có file thì bỏ hẳn trường (không trả `null`) |
| B-4 | Bản đã duyệt giữ đúng model lúc duyệt | Xong |
| B-5 | Lưu checksum của file | Xong (BE tự tính SHA-256 từ file nhận được) |
| **B-6** | **Số đo và file là một cặp** | **Chưa làm**: sửa số đo không cần file; storefront không nhận checksum; không lưu chung một request |
| C-1 | Hồ sơ màu (ICC) trong file in PDF/X-4 | Xong tạm: đang nhúng sRGB cho tới khi cấu hình `DESIGN_PRINT_ICC_PROFILE` |
| C-2 | Kiểm file trước khi cấp link tải cho khách | Xong; file hỏng trả 409 `CONFLICT` |
| E-1 | Thư viện chữ của dự án | Xong, đúng đường dẫn đề xuất; thêm hai sự kiện lịch sử mới |
| E-2 | Lưu ảnh từ thiết kế vào thư viện | Xong |
| E-3 | Nhân bản thiết kế sang cỡ khác | Xong; lỗi là 409 `DESIGN_CLONE_TARGET_INVALID` |
| E-4 | Ghi preflight hỏng theo lô của dự án | Xong |
| E-5 | Upload thư viện không bị trùng | Xong |

## 3. Storefront với BE

**Số liệu, trên 36 endpoint storefront đang gọi:**

| Tình hình | Số endpoint |
|---|---|
| Khớp ngay | 4 |
| Khớp sau khi FE chuyển đổi như đã dự kiến hôm 13/11 | 27 |
| Đã dự kiến chuyển đổi nhưng còn lệch ngoài dự kiến | 4: gửi duyệt, cấu hình in và `model3d`, lịch sử dự án, vòng duyệt |
| BE thiếu | 1: `draft-count`, FE tự đếm được, không cần hỏi BE |

**Năm chỗ sẽ làm storefront hỏng đầu tiên khi bỏ mock:**

1. **Không đọc được dữ liệu.** Schema của FE bắt buộc nhiều trường mà BE không gửi (BE bỏ hẳn trường rỗng thay vì
   gửi `null`; thiết kế thiếu `product`, `variant`, `project`, `createdAt`, `approval`). Một thiết kế không đọc được
   làm hỏng cả trang danh sách.
2. **Sai đường dẫn hoặc phương thức.** Ví dụ tạo thiết kế là `POST /designs/mine` cần `productId` và `templateCode`;
   đổi tên là `PUT …/name`; lưu trữ là `POST …/archive`; file là `…/artifacts`; thư viện tách làm `/assets` và
   `/texts`.
3. **Studio không mở được.** BE không có `/print-config`; dữ liệu tuỳ biến (`/customization`) có dạng khác; thiết kế
   trên template đã thay cần đọc `GET /designs/{id}/template`, storefront chưa gọi.
4. **Luồng gửi duyệt khác hẳn.** BE cần: lưu, tải lên ba file từng cái một kèm checksum của bản thiết kế (mỗi lần
   tải phiên bản lại tăng), đọc lại phiên bản, rồi mới gửi yêu cầu duyệt. BE còn tự kiểm preflight và tự ghi lần
   hỏng, nên storefront không được ghi trùng.
5. **Không hiểu lỗi của BE.** Phiên bản cũ là `CONFLICT`; các giới hạn là mã `DESIGN_*`; lỗi preflight dùng `rule`,
   câu tiếng Anh, không có mức độ, nên danh sách lỗi trong studio sẽ trống.

**Điểm khớp đáng chú ý:** tên trạng thái và vòng đời của thiết kế và dự án trùng hoàn toàn; vòng duyệt của dự án đúng
là duyệt hoặc trả cả bộ.

**Điểm nhỏ:** danh sách file của thiết kế có thêm vai trò `PRODUCTION_INSTRUCTION` mà schema của FE chưa có; lỗi
vòng duyệt do phiên bản cũ không nói thiết kế nào gây ra.

## 4. Back-office với BE

**Hai câu hỏi quyết định việc tách:**

- **Số đo và file có lưu trong một request không?** Không. Tạo và sửa template là JSON; file đi riêng qua
  `PUT …/model-file?version=`. Giữa hai request, BE giữ số đo mới với file cũ. Nếu request thứ hai hỏng, cặp bị lệch;
  với template đang dùng, storefront đọc ngay cặp lệch đó.
- **BE có chặn số đo và file lệch nhau không?** Không. Sửa template không xem file đang lưu; checksum mà back-office
  gửi kèm bị BE bỏ qua mà không báo lỗi.

**Những gì màn hình "Cấu hình in" phải sửa để chạy với BE, theo mức độ nghiêm trọng:**

1. **Đọc dữ liệu:** `model3d` của BE luôn có mặt, dạng `{hasFile, fileName, fileChecksum, surfaces}`, không có
   `url`. Schema hiện tại sẽ từ chối mọi response.
2. **Lưu:** đổi từ một request multipart sang hai bước: JSON `POST`/`PUT`, rồi `PUT …/model-file` với phiên bản mới
   nhận về; so `fileChecksum` trả về với checksum của các byte đã đo.
3. **Lưu hỏng giữa chừng:** xử lý trường hợp số đo đã lưu mà file chưa lên; cho thử lại riêng bước file.
4. **Xem file đã lưu:** gọi `…/model-file/download-url`; kho file cần cho phép origin của back-office (chưa kiểm được
   từ code).
5. **Mã lỗi:** bỏ ba mã tự đặt `MODEL_FILE_*`; dùng 422 `PRINT_CONFIG_SURFACES_INVALID` và 400 `VALIDATION_FAILED`.
6. **Quyền:** BE dùng bộ quyền riêng `product-customization-templates:{VIEW_PAGE, READ, CREATE, UPDATE, DELETE}`
   (theo ghi chú trong code BE: Sales Manager và System Admin có quyền này). Back-office chưa có, đang tạm dùng quyền
   sửa sản phẩm.
7. **Mock và test hợp đồng:** viết lại theo hợp đồng thật.

Khớp sẵn: danh sách template, kích hoạt và ngừng dùng (dùng endpoint BE đã có), dạng `model3d.surfaces` khi gửi lên.

## 5. Nên gửi lại BE

| Việc | Lý do |
|---|---|
| **B-6:** không nhận sửa số đo đo từ file nếu không kèm file mới hoặc checksum trùng file đang lưu; lý tưởng là nhận số đo và file trong một request | Đây là điều kiện của việc chuyển phần kiểm file sang back-office; thiếu nó thì hình trên 3D có thể sai chỗ mà không ai biết |
| **B-2:** bắt ghép đủ mọi vùng in, tên mesh đúng dạng `print:<mã>` | Storefront hiện bỏ qua cả `model3d` khi bảng ghép thiếu hoặc sai tên, nên khách sẽ chỉ thấy mẫu dựng bằng code mà không rõ vì sao |
| Trả `modelFileChecksum` cho storefront (trong `/customization` và `/designs/{id}/template`) | Một phần của B-6 |
| Lỗi preflight: thêm mức độ (lỗi / cảnh báo) và câu tiếng Việt, hoặc chốt danh sách `rule` để FE tự dịch | Để studio hiện được lỗi |
| Lỗi vòng duyệt của dự án nêu rõ thiết kế nào bị cũ | Để khách biết sửa thiết kế nào |
| Xác nhận kho file `.glb` cho phép origin của storefront và back-office, chạy https | Không kiểm được từ code |

## 6. Không quyết được từ code

- Kho file S3 cho phép những origin nào, có chạy https không.
- Hồ sơ màu ICC thật dùng cho file in.
- Vòng checksum khi tải file lên và phần kiểm hình học của file PDF in: đọc thấy khớp, chưa chạy thử.

## 7. Lộ trình module 12

| Phần | FE | BE (develop 14/11) |
|---|---|---|
| A — Nền tảng và vòng đời | Xong, đã commit và push; chạy trên mock | Đủ; FE cần chuyển đổi |
| B — Cấu hình in, model `.glb` | Storefront và back-office xong trên mock, đã commit và push | Có B-1..B-5; **thiếu B-6** |
| C — Bộ file xuất | Làm một phần | C-1 tạm, C-2 xong |
| D — SKU riêng, yêu cầu báo giá | Chưa làm | BE đã có (chưa đối chiếu) |
| E — Dự án thiết kế | Xong, đã commit và push; chạy trên mock | Đủ; FE cần chuyển đổi |
| Gói kiểu Canva | Chỉ có spec và plan | Không liên quan |
