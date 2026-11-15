# Studio — gói nâng cấp kiểu Canva (spec)

Ngày: 2026-11-12. Nhánh: `feat/design-m12-a-foundation`. Làm **trước phần E**. Giữ nguyên 8 phông
hiện có (thêm phông sẽ quyết sau). Chỉ áp dụng cho studio (`/design/[id]`), chỉ trên máy tính như
hiện nay.

## 1. Mục tiêu

Studio thao tác nhanh và quen tay như Canva: thêm chữ đẹp ngay bằng tổ hợp phông, chỉnh cỡ nhanh,
viết hoa, căn và bắt dính chính xác, sao chép / dán, menu chuột phải, dùng lại màu đang có, chọn và
xử lý nhiều phần tử cùng lúc. Mọi thứ phải **in ra đúng như trên màn hình** (file in, xem trước 2D /
3D, preflight).

**Ngoài phạm vi:** thêm phông, cắt ảnh (crop), hình cơ bản, nhóm phần tử (group), co giãn / xoay
nhiều phần tử cùng lúc, sao chép sang bản thiết kế khác.

## 2. Chín tính năng

### 2.1 Tổ hợp phông trong bảng Chữ

Mục "Kiểu chữ có sẵn" (hiện 3 kiểu chỉ khác cỡ) đổi thành các tổ hợp, mỗi tổ hợp hiện **đúng phông,
đúng kiểu** của nó; bấm là đặt một chữ mới với kiểu đó (như nút hiện nay, chỉ khác kiểu):

| Tên | Phông | Cỡ | Kiểu |
|---|---|---|---|
| Tiêu đề đậm | Montserrat | 48 pt | đậm |
| Tiêu đề sang trọng | Playfair Display | 44 pt | nghiêng |
| Bảng hiệu | Oswald | 48 pt | viết hoa, giãn chữ 0,05 em |
| Chữ viết tay | Dancing Script | 40 pt | — |
| Dễ thương | Pacifico | 36 pt | — |
| Cổ điển | Lobster | 40 pt | — |
| Phụ đề | Be Vietnam Pro | 24 pt | — |
| Ghi chú | Be Vietnam Pro | 12 pt | — |

Tổ hợp nào dùng phông mà khuôn in không cho (`allowedFontCodes`) thì ẩn. "Thêm chữ" giữ nguyên
(Be Vietnam Pro 24 pt).

### 2.2 Cỡ chữ: nút −/+ và danh sách cỡ

Cạnh ô cỡ chữ trên thanh ngữ cảnh: nút **−** và **+** (mỗi lần 1 pt, giữ giới hạn cỡ hiện có) và
một danh sách cỡ hay dùng: 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96. Gõ số
vẫn được như cũ. Mỗi lần bấm là một bước hoàn tác.

### 2.3 Viết hoa toàn bộ (Aa)

- Nút bật / tắt **"Viết hoa"** cạnh Đậm / Nghiêng.
- Phần tử chữ thêm trường không bắt buộc `uppercase?: true`; tài liệu cũ không có trường này vẫn
  hợp lệ (coi như tắt).
- Nội dung **lưu nguyên như khách gõ**; chỉ khi hiển thị và in thì đổi sang chữ hoa theo tiếng Việt
  (`toLocaleUpperCase("vi")`, ví dụ "đ" → "Đ"). Áp dụng ở mọi nơi vẽ chữ: khung vẽ, chữ uốn theo
  ly, file in, xem trước 2D / 3D, đo khung chữ, preflight; ô sửa chữ trực tiếp cũng hiện chữ hoa.
- Tắt viết hoa thì chữ trở lại đúng như đã gõ.

### 2.4 Căn nhanh 6 hướng

Trong popover "Vị trí": **Căn trái, Căn giữa ngang, Căn phải, Căn trên, Căn giữa dọc, Căn dưới**
(thay cho 2 nút căn giữa hiện có).

- **Một phần tử:** căn theo **vùng an toàn** của mặt in.
- **Nhiều phần tử (§2.9):** căn theo **khung bao của cả nhóm đang chọn** (như Canva).
- Căn dựa trên khung bao thật của phần tử trên mặt in (tính cả xoay); với ly hình quạt, "trái /
  phải" theo hướng vòng quanh thân ly.
- Phần tử bị khoá không di chuyển. Mỗi lần căn là một bước hoàn tác.

### 2.5 Bắt dính vào phần tử khác

Khi kéo phần tử, ngoài tâm và mép mặt in như hiện nay, phần tử còn bắt dính vào **các phần tử khác
trên cùng mặt**:

- Mép trái / tâm / mép phải của phần tử đang kéo dính vào mép trái / tâm / mép phải của phần tử khác.
  Mép trên / giữa / dưới cũng vậy theo chiều dọc.
- Ngưỡng bắt dính như hiện tại (2 mm); đường gióng hiện ra khi đang dính.
- Giữ **Alt** khi kéo để tạm tắt bắt dính.
- Phần tử ẩn không tham gia bắt dính.

### 2.6 Sao chép / cắt / dán / nhân bản bằng phím

- **Ctrl+C** sao chép, **Ctrl+X** cắt, **Ctrl+V** dán, **Ctrl+D** nhân bản (đã có, nay áp dụng cả
  khi chọn nhiều phần tử). Trên Mac dùng ⌘.
- Bộ nhớ sao chép nằm trong studio, dùng trong **cùng một bản thiết kế** (giữ khi đổi mặt in, mất khi
  tải lại trang).
- Dán lên **mặt đang mở**: cùng mặt với bản gốc thì lệch 5 mm xuống phải để không đè lên nhau; sang
  mặt khác thì giữ vị trí, kẹp vào vùng in nếu tràn. Chữ uốn / ảnh uốn dán sang mặt phẳng thì bỏ uốn.
- Mặt in đã đủ 200 phần tử thì không dán, báo lý do.
- Dán ảnh từ ngoài vào (ảnh trong clipboard hệ thống) vẫn chạy như hiện nay và **được ưu tiên** khi
  clipboard hệ thống đang có ảnh.
- Mỗi lần dán / cắt là một bước hoàn tác.

### 2.7 Menu chuột phải

- Bấm chuột phải lên phần tử: phần tử được chọn (nếu chưa nằm trong nhóm đang chọn) và mở menu.
  Bấm chuột phải lên chỗ trống: menu chỉ có Dán và Chọn tất cả.
- Mục trong menu, kèm phím tắt hiển thị bên phải: **Sao chép** (Ctrl+C), **Cắt** (Ctrl+X), **Dán**
  (Ctrl+V), **Nhân bản** (Ctrl+D), **Xoá** (Delete), **Lên một lớp** (Ctrl+]), **Xuống một lớp**
  (Ctrl+[), **Lên trên cùng**, **Xuống dưới cùng**, **Khoá / Mở khoá**, **Sao chép kiểu**
  (Ctrl+Alt+C), **Dán kiểu** (Ctrl+Alt+V), **Chọn tất cả** (Ctrl+A).
- Mục không dùng được thì mờ đi (ví dụ Dán khi chưa sao chép gì, Xoá khi bị khoá).
- Bàn phím: **Shift+F10** hoặc phím Menu mở menu tại phần tử đang chọn; Esc đóng.
- Bản chỉ xem: không có menu.
- **Sao chép kiểu / Dán kiểu:** chữ → chữ: phông, cỡ, màu, đậm, nghiêng, viết hoa, căn lề, viền,
  giãn chữ, giãn dòng, độ mờ; giữa các loại khác nhau chỉ chép độ mờ. Dán kiểu áp lên mọi phần tử
  đang chọn, một bước hoàn tác.
- Dùng primitive shadcn `context-menu` (thêm file vào `src/components/ui/` đúng như shadcn sinh ra,
  không chỉnh; Radix đã có sẵn trong gói `radix-ui`, không thêm thư viện mới).

### 2.8 Màu trong thiết kế

Bảng chọn màu (màu chữ, màu viền, màu nền, màu nét vẽ) có thêm nhóm **"Màu trong thiết kế"** phía
trên "Màu gần đây": các màu đang dùng ở **mọi mặt in** của bản (chữ, viền, nền màu và hai màu của
nền hoa văn, nét vẽ), không trùng, màu dùng nhiều nhất trước, tối đa 12 ô. Bấm một ô là dùng màu đó.

### 2.9 Chọn nhiều phần tử

- **Cách chọn** (trên mặt đang mở):
  - **Shift + bấm** lên phần tử để thêm / bớt khỏi nhóm chọn;
  - **kéo khung** từ chỗ trống (công cụ Chọn) để chọn các phần tử chạm khung;
  - **Ctrl+A** chọn tất cả;
  - trong bảng **Lớp**: Shift / Ctrl + bấm.
  - Kéo khung và Ctrl+A bỏ qua phần tử bị khoá và phần tử ẩn.
- **Hiển thị:** mỗi phần tử có khung chọn mảnh, cả nhóm có một khung bao nét đứt. Thanh ngữ cảnh đổi
  thành **"N phần tử"** với: Căn 6 hướng (§2.4), Nhân bản, Xoá, Khoá / Mở khoá, Độ mờ (chung), Lên
  / Xuống lớp.
- **Thao tác chung:** kéo để di chuyển cả nhóm (có bắt dính theo khung bao nhóm); phím mũi tên dịch
  cả nhóm; Delete, Ctrl+D, Ctrl+C / X / V, Sao chép / Dán kiểu áp cho cả nhóm. Mỗi thao tác là **một**
  bước hoàn tác.
- **Không làm:** co giãn / xoay cả nhóm, nhóm cố định (group). Muốn co giãn thì chọn từng phần tử.
- Đổi mặt in hoặc bấm vào chỗ trống thì bỏ chọn.
- **Mô hình chọn:** trạng thái trình chỉnh sửa có `selectedIds: string[]` (thứ tự chọn); `selectedId`
  giữ lại là phần tử chọn gần nhất để các phần đang dùng không phải đổi.

## 3. Trạng thái và lỗi

- Bản chỉ xem: không chọn nhiều, không menu chuột phải, không dán / cắt / dán kiểu; Ctrl+C vẫn không
  làm gì (không có gì để dán).
- Phần tử bị khoá: không di chuyển, không xoá, không dán kiểu; vẫn sao chép được.
- Mọi thao tác mới đi qua lệnh của trình chỉnh sửa (tự lưu, hoàn tác như cũ).

## 4. Test

- Tổ hợp phông: đặt đúng phông, cỡ, kiểu; ẩn khi khuôn không cho phông.
- Cỡ chữ: −/+ trong giới hạn, chọn từ danh sách, một bước hoàn tác mỗi lần.
- Viết hoa: hiển thị và đo theo chữ hoa tiếng Việt ("đường" → "ĐƯỜNG"), nội dung lưu không đổi, file
  in và chữ uốn dùng chữ hoa; tài liệu cũ vẫn đọc được.
- Căn 6 hướng: một phần tử theo vùng an toàn (mặt phẳng và ly); nhiều phần tử theo khung bao nhóm;
  phần tử khoá đứng yên.
- Bắt dính: mép / tâm dính vào phần tử khác trong ngưỡng, Alt tắt dính, phần tử ẩn bị bỏ qua.
- Sao chép / cắt / dán: lệch 5 mm cùng mặt, giữ vị trí khác mặt, đủ 200 phần tử thì từ chối, ảnh từ
  clipboard hệ thống được ưu tiên, một bước hoàn tác.
- Menu chuột phải: mở bằng chuột và Shift+F10, mục mờ đúng lúc, mỗi mục gọi đúng lệnh; sao chép /
  dán kiểu chữ → chữ và khác loại.
- Màu trong thiết kế: gom đủ nguồn màu, không trùng, sắp theo số lần dùng, tối đa 12.
- Chọn nhiều: Shift+bấm, kéo khung, Ctrl+A (bỏ qua khoá / ẩn), Lớp; di chuyển / xoá / nhân bản / căn
  cả nhóm, mỗi lần một bước hoàn tác; thanh "N phần tử".
