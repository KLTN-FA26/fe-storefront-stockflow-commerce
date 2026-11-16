# Module 12 phần B — storefront: hiện model 3D từ file `.glb` (spec)

Ngày: 2026-11-13. Nhánh: `feat/design-m12-a-foundation`. Làm trước BE và back-office, chạy trên mock.
Quy ước chung của ba bên: `docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md`. Bản đồ
code hiện có: `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\glb\code-map.md`.

## 1. Mục tiêu

Studio của khách hiện model 3D thật (file `.glb` dựng bằng Blender) thay cho mẫu 3D dựng bằng code, và hình
thiết kế dán lên model **đúng chỗ như bản in**. Kèm theo: phần đo và kiểm model chạy trên trình duyệt, và
một trang thử model để kiểm file Blender ngay bây giờ, trước khi có back-office.

**Thế nào là xong:** trên mock, mở một bản thiết kế của quy cách có `.glb` → thấy model thật, logo và chữ
nằm đúng vị trí như trên khuôn 2D, kéo thả / uốn / bấm chọn trên 3D vẫn chạy; ảnh xem trước khi gửi duyệt
và nút "Xem 3D" ở trang dự án dùng model thật; quy cách không có `.glb` hoặc file lỗi thì studio vẫn chạy
như hôm nay. Trang thử model nhận một file `.glb`, báo số đo, lỗi (nếu có) và cho xem ô lưới đánh số.

**Ngoài phạm vi:** màn hình back-office, API của BE, file khuôn 2D thật (hướng B), bề mặt không trải phẳng
được.

## 2. Phát hiện khi đọc code và quyết định theo đó

| Phát hiện | Quyết định |
|---|---|
| Ảnh dán lên mẫu 3D hiện nay **là chính tờ khuôn phẳng** (cả khung tràn lề của hình quạt), không phải hình chữ nhật trải quanh thân. Toạ độ dán (UV) của từng điểm được **code tính** từ vị trí điểm đó trên thân ly (`cup-mesh.ts`, `surface.toFlat` → `surface.uvOf`). | **Hệ thống tự tính UV cho phần in của file `.glb`**, bằng đúng công thức đang dùng: lấy vị trí 3D của từng điểm (góc quanh trục, độ cao; hoặc vị trí trên mặt phẳng) → toạ độ trên mặt in → toạ độ trên tờ khuôn. **Bỏ qua UV có sẵn trong file.** |
| Hệ quả của dòng trên | Người dựng Blender **không phải trải UV theo quy ước nào** cho phần in. Bước "kiểm UV tự động" đã duyệt được thay bằng thứ mạnh hơn: UV luôn đúng vì do hệ thống tính. Lỗi "trải UV sai / lật ngược / đường nối sai chỗ" không còn xảy ra được. |
| Điểm nằm hai bên đường nối phía sau ly phải tách riêng, nếu không ảnh bị kéo vệt ngang thân. | Hệ thống tự tách các tam giác vắt qua đường nối (phía −Z). Không yêu cầu file tự tách. |
| Mọi thứ 2D (khuôn, vùng in, preflight, file in) chỉ đọc bộ số đo (`model` kiểu ly / túi). Kiểu `gltf` hiện bị từ chối ở 5 chỗ. | **Giữ bộ số đo làm nền.** Thêm dữ liệu `.glb` **bên cạnh**: `model3d: { url, surfaces: [{ printAreaCode, meshName }] } \| null`. Không dùng kiểu `gltf` thay cho bộ số đo. Phần 2D không đổi một dòng nào. |
| Cảnh 3D dùng đơn vị mm; file `.glb` dùng mét. | Nhân 1000 khi nạp. |
| Vật liệu phần in do studio tạo (giấy trắng, kraft, nhựa trong) theo `model.material`. | Giữ nguyên cho các mesh `print:*`; các mesh khác giữ vật liệu trong file. |
| `setModel` của viewer chạy đồng bộ; nạp `.glb` là bất đồng bộ. | Viewer **hiện mẫu dựng từ số đo ngay**, rồi đổi sang model `.glb` khi nạp xong. Nạp lỗi thì giữ mẫu cũ và báo một dòng nhỏ. Không có lúc nào màn hình 3D trống. |
| Bấm chọn trên 3D (`pick.ts`) đảo ngược đúng phép dán ảnh. | Vì UV do cùng công thức tính nên bấm chọn chạy được mà không sửa phép tính. |

## 3. Dữ liệu

- **Cấu hình in** (DTO `print-config` và template): thêm trường không bắt buộc
  `model3d: { url: string; surfaces: { printAreaCode: PrintAreaCode; meshName: string }[] } | null`. Vắng hoặc
  `null` nghĩa là không có `.glb`.
- **Mock:** một hoặc hai quy cách mẫu có `model3d` trỏ tới file trong `public/models/…` (file tĩnh; mock axios
  không chặn việc tải file này). Số đo của quy cách mẫu lấy từ kết quả đo file đó (mục 5), ghi sẵn trong
  `design-print-configs.ts`.
- **File mẫu:** dùng file `.glb` do bạn dựng bằng Blender khi có. Trong lúc chờ, một file mẫu được tạo từ
  chính mẫu ly dựng bằng code (xuất ra `.glb`) để chạy test và demo luồng.

## 4. Viewer và studio

- **Nạp model** (`engine/viewer3d`): module mới nạp `.glb` bằng `GLTFLoader` của three (tải khi cần, không
  nằm trong gói chính), đổi đơn vị, tìm mesh theo `surfaces[].meshName`, tính lại UV và tách đường nối cho
  từng mesh in, gán vật liệu in. Có huỷ giữa chừng và giới hạn thời gian (15 giây, như ảnh và phông).
- **`ProductViewer`**: nhận thêm `model3d`. Dựng mẫu từ số đo như cũ; khi `.glb` nạp xong thì thay nhóm mesh,
  giữ nguyên ảnh đang dán, góc nhìn, ánh sáng theo camera, bấm chọn, xoay tới mặt in (`focusSurface` dùng góc
  cố định: mặt trước của model phải nhìn về +Z). Khung hình (`frameModel`) lấy theo hộp bao của model thật.
- **Studio** (`viewer-3d.tsx`, `viewer-host.tsx`): truyền `model3d` xuống; hiện "Đang tải mô hình 3D…" nhỏ
  trong lúc nạp; nạp lỗi thì hiện "Không tải được mô hình 3D, đang dùng mẫu thay thế" (không chặn thiết kế).
- **Ảnh xem trước khi gửi duyệt** (`preview-export.ts`) và **"Xem 3D" ở trang dự án**
  (`load-design-session.ts`, `design-3d-render.ts`): chờ `.glb` nạp xong (tối đa 15 giây) rồi mới chụp; quá
  hạn hoặc lỗi thì chụp bằng mẫu dựng từ số đo.
- Bản chỉ xem, đổi chỗ 2D/3D, thu nhỏ thẻ 3D, toàn màn hình: không đổi hành vi.

## 5. Đo và kiểm model (code thuần, dùng lại cho back-office sau này)

Module `engine/model3d/` (không phụ thuộc React), nhận cảnh đã nạp từ `.glb`:

- **Nhận dạng**: có `print:BODY` → ly; có `print:FRONT` / `BACK` / `LEFT` / `RIGHT` → túi.
- **Đo**: ly → bán kính vòng trên, bán kính vòng dưới, chiều cao phần in (mm); túi → rộng × cao từng mặt.
  Trả ra đúng dạng bộ số đo hiện có (`parametric-cup` / `parametric-bag`), mép dán và lề lấy mặc định.
- **Kiểm**, mỗi lỗi có mã và câu tiếng Việt nói rõ sai gì, ở phần nào:
  1. có ít nhất một mesh `print:*` hợp lệ; tên không trùng;
  2. đơn vị hợp lý (ví dụ ly cao 20–400 mm; ngoài khoảng đó là sai đơn vị);
  3. `print:BODY` là mặt nón tròn xoay quanh trục Y, sai số ≤ 0,5 mm; đủ mịn (số cạnh quanh thân ≥ 32);
  4. các mặt túi phẳng và là hình chữ nhật, sai số ≤ 0,5 mm;
  5. dung lượng ≤ 10 MB, ≤ 100.000 tam giác;
  6. mặt trước nhìn về +Z, đáy ở Y = 0 (cảnh báo, không chặn).
- **Đối chiếu**: so số đo với các số danh nghĩa người dùng gõ (không bắt buộc); lệch > 1 mm thì cảnh báo.

## 6. Trang thử model

- Đường dẫn `/design/model-check`, nằm trong nhóm trang studio (chỉ máy tính), **chỉ hiện khi module design
  đang chạy mock** (cùng điều kiện với bảng "Giả lập").
- Chọn hoặc kéo thả một file `.glb` (đọc ngay trên trình duyệt, không tải lên đâu cả) → hiện:
  - kết quả nhận dạng và **số đo đọc được**;
  - danh sách lỗi / cảnh báo;
  - ô nhập số danh nghĩa để kiểm chéo (không bắt buộc);
  - **model với ô lưới đánh số** dán lên từng vùng in, xoay được, và khuôn 2D tính ra bên cạnh;
  - đoạn cấu hình (JSON) để dán vào mock khi muốn dùng file đó làm quy cách mẫu.

## 7. Quy ước file `.glb` sau thay đổi này (đơn giản hơn bản đã duyệt)

Người dựng Blender chỉ cần: **kích thước thật** (1 đơn vị = 1 mét, đã áp dụng transform); trục Y hướng lên,
đáy ở Y = 0, mặt trước về +Z; **phần in là object riêng tên `print:BODY`** (ly: đúng dải được in, là mặt tròn
xoay quanh trục Y) hoặc `print:FRONT`, `print:BACK`, `print:LEFT`, `print:RIGHT` (túi: hình chữ nhật phẳng);
không nén Draco, không animation, ≤ 10 MB. **Không cần trải UV cho phần in.** Nếu spec này được duyệt, mục 4
và mục 5 của file quy ước chung sẽ được sửa theo (bỏ yêu cầu UV, thay "kiểm UV" bằng "UV do hệ thống tính").

## 8. Lỗi và trạng thái

- `.glb` tải lỗi, quá 15 giây, thiếu mesh được ghép, hoặc không qua kiểm hình: dùng mẫu dựng từ số đo, hiện
  một dòng báo, ghi `console.warn` kèm mã lỗi. Thiết kế, lưu, gửi duyệt không bị chặn.
- Máy không có WebGL: như hôm nay (ảnh phẳng).
- Model nạp xong sau khi người dùng đã rời trang hoặc đổi bản: huỷ, giải phóng bộ nhớ.

## 9. Test

- **Đo và kiểm** (unit, dựng cảnh three trong bộ nhớ): ly và túi đúng → số đo đúng đến 0,1 mm; từng lỗi ở mục
  5 cho ra đúng mã; file tính bằng mét được đổi sang mm.
- **Tính UV**: với một mesh ly có lưới điểm khác hẳn mẫu dựng bằng code (số cạnh khác, không có UV), UV tính
  ra tại mỗi điểm trùng với công thức của mẫu hiện tại (sai số < 1e-6); tam giác vắt qua đường nối được
  tách; mặt túi tương tự.
- **Viewer**: có `model3d` → hiện mẫu số đo trước, đổi sang model khi nạp xong, ảnh đang dán vẫn còn; nạp lỗi
  / quá hạn → giữ mẫu số đo và báo; huỷ khi dispose; bấm chọn trên model trả đúng vùng in và toạ độ.
- **Studio**: dòng "Đang tải mô hình 3D…" và dòng báo lỗi; bản không có `model3d` không đổi gì (các test hiện
  có giữ nguyên).
- **Ảnh xem trước / Xem 3D**: chờ model; quá hạn thì vẫn chụp được.
- **Trang thử model**: chọn file → số đo, lỗi, ô lưới; chỉ hiện khi chạy mock.
- Schema: `model3d` vắng, `null`, hợp lệ, `printAreaCode` không thuộc template.

## 10. Thay đổi ngày 2026-11-13: đo và kiểm chuyển sang back-office

Chủ dự án quyết định: việc đo file, kiểm lỗi, sinh số đo 2D từ model và so với số của nhà sản xuất thuộc về
back-office, nơi upload thông tin sản phẩm. Storefront chỉ tải file, dán hình và hiển thị. Kế hoạch chuyển:
`docs/superpowers/plans/2026-11-13-design-glb-tach-storefront-backoffice.md`.

Các mục của spec này đổi như sau:

- **Mục 4** (viewer và studio): giữ nguyên, trừ việc phần dựng cảnh không còn đo file và không còn so file với
  bộ số đo. Nó tìm mesh của từng vùng in theo tên; thiếu mesh hoặc mesh hỏng thì dùng mẫu dựng từ số đo.
- **Mục 5** (đo và kiểm model) và **mục 6** (trang thử model): chuyển sang repo back-office `stockflow-ui`,
  `src/features/product-design/model3d/` và màn hình upload ở trang "Cấu hình in" của biến thể
  (`/admin/products/[id]/variants/[variantId]/print-config`). Không còn ở storefront.
- **Mục 8** (lỗi và trạng thái): bỏ trường hợp "không qua kiểm hình" và mã `MODEL_MISMATCH`. Các mã còn lại:
  `LOAD_FAILED`, `ABORTED`, `MESH_MISSING`, `INVALID_MODEL`.
- **Mục 9** (test): bỏ các dòng "Đo và kiểm" và "Trang thử model"; các test đó chuyển theo code sang back-office.

Hệ quả đã chấp nhận: nếu số đo và file không còn là một cặp, storefront vẫn hiện file và hình trên 3D sai chỗ
mà không báo; file in vẫn đúng. Việc chặn thuộc về back-office (số đo chỉ sinh từ file, không gõ tay; file có phần in
lệch quá 1 mm so với cấu hình sắp lưu thì không lưu được; số đo và file gửi trong một lần lưu) và BE (mục
B-6 trong `docs/superpowers/reports/2026-11-13-design-yeu-cau-bo-sung-cho-be.md`).
