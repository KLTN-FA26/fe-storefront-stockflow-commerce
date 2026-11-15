# Module 12 phần B — model 3D (.glb) và khuôn 2D: quyết định và quy ước

Ngày: 2026-11-13 (cập nhật theo các quyết định mới nhất của người dùng). Nguồn: docs
`warehouse/01-product-creation` §4.10, BR-18, BR-21, câu hỏi mở B34, B36; code FE (`engine/template`,
`engine/surfaces`, `engine/viewer3d`); code BE `origin/develop` `df34c338` (module `product`:
`CustomizationTemplateController`, `ProductModel`). Chưa có code; đây là tài liệu để BE, back-office và
storefront làm theo.

## 1. Quyết định (2026-11-13)

| Chủ đề                                 | Quyết định                                                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model 3D                               | **File `.glb` thật, dựng bằng Blender.**                                                                                                                                                                                   |
| Khuôn 2D                               | **Sinh ra từ model 3D** (hướng A): không tải file 2D riêng, không gõ kích thước. Hệ thống **đo ngay trên file `.glb`** rồi tính ra khuôn 2D và vùng in. Một nguồn duy nhất nên 2D và 3D khớp nhau theo cấu trúc.           |
| Kiểm tra khi tải file                  | **Các bước kiểm chạy trên trình duyệt ở back-office**, trước khi lưu: kiểm hình, đối chiếu số đo với thông số nhà sản xuất, xem thử ô lưới (mục 5). Không cần BE.                                                          |
| Toạ độ dán ảnh (UV)                    | **Hệ thống tự tính** cho phần in, từ vị trí từng điểm trên model, bằng đúng công thức của khuôn 2D. Bỏ qua UV trong file: người dựng model **không cần trải UV** cho phần in, và hình trên 3D khớp khuôn 2D theo cấu trúc. |
| Lề, mép dán, ràng buộc file, chất liệu | **Điền sẵn mặc định**, chỉ sửa trong mục "Nâng cao" khi cần (mục 6). Người khai báo không phải nhập hằng ngày.                                                                                                             |
| Gõ số đo                               | Chỉ còn một chỗ, **không bắt buộc**: gõ số danh nghĩa từ bảng thông số nhà sản xuất **để kiểm chéo**, không dùng để dựng hình.                                                                                             |
| File khuôn 2D thật (hướng B)           | **Để sau.** Chỉ cần cho hình không đo được từ model, hoặc khi có khuôn bế thật từ nhà in (mục 10).                                                                                                                         |

## 2. Hiện trạng trước khi làm

- FE và BE đang dùng **số đo nhập tay**: ly (`parametric-cup`: đường kính miệng / đáy, chiều cao, mép…)
  và túi (`parametric-bag`: rộng, hông, cao…). Từ số đo, cả hai bên tính ra vùng in (hình quạt `BODY` cho
  ly; bốn hình chữ nhật `FRONT`, `BACK`, `LEFT`, `RIGHT` cho túi) và FE dựng mẫu 3D bằng code.
- BE: `POST/PUT /api/v1/products/{productId}/variants/{variantId}/customization-templates` nhận `model`
  (ly hoặc túi) + lề từng vùng in + ràng buộc file; có phiên bản, kích hoạt / ngừng dùng; có
  `PUT …/reference-file` (PDF / PNG tham khảo, có quét virus). glTF đang bị từ chối ở cả FE và BE (B36).

## 3. Cách hoạt động

1. Người dựng model làm file `.glb` theo quy ước ở mục 4 (kích thước thật).
2. Ở back-office, người khai báo tải file lên. **Công cụ trên trình duyệt đọc file** (three.js), tìm các phần
   được in (`print:<MÃ>`) và **đo**:
   - **Ly** (có `print:BODY`): bán kính vòng trên, bán kính vòng dưới và chiều cao của phần in → hình quạt
     của khuôn 2D tính bằng công thức từ ba số này.
   - **Túi / hộp mặt phẳng** (có `print:FRONT`, `print:BACK`, `print:LEFT`, `print:RIGHT`): rộng × cao của
     từng mặt → các vùng in chữ nhật.
3. Công cụ chạy bốn bước kiểm (mục 5). Không đạt thì không lưu.
4. Các số đo được điền vào đúng bộ thông số BE đang dùng (`model` của template). **BE vẫn tính vùng in từ bộ
   thông số đó như hiện nay**; preflight, file in, đóng dấu PDF không đổi. Khác biệt duy nhất: số đo do máy
   đọc từ file, không do người gõ.
5. BE lưu thêm file `.glb` và bảng ghép "vùng in ↔ tên mesh", trả cho storefront.
6. Storefront nạp `.glb`, vẽ từng vùng in thành một ảnh và dán lên đúng mesh. "Uốn theo thân ly" vẫn chính
   xác vì hình quạt là hình toán học tính từ số đo của chính model.

Hai loại chính xác cần phân biệt:

- **2D khớp 3D** (cái khách thấy là cái sẽ in): bảo đảm theo cấu trúc, vì khuôn 2D sinh từ model và toạ độ
  dán ảnh do hệ thống tính bằng cùng một công thức.
- **2D khớp sản phẩm thật** (tờ in cuộn vừa cái ly thật): phụ thuộc model được dựng đúng kích thước thật;
  bước đối chiếu với thông số nhà sản xuất (mục 5, bước 3) là chốt chặn cho loại này.

Giới hạn: chỉ dùng cho bề mặt **trải phẳng được**: nón cụt, trụ, mặt phẳng. Bề mặt cong hai chiều (tô, nắp
vòm) không đo ra khuôn phẳng được: chưa hỗ trợ.

## 4. Quy ước file `.glb` (cho người dựng bằng Blender)

- **Định dạng**: glTF 2.0 dạng nhị phân (`.glb`), một file. Không nén Draco / Meshopt. Tối đa 10 MB, tối đa
  100.000 tam giác. Không animation, camera, đèn.
- **Kích thước thật**: 1 đơn vị = 1 mét (ly cao 90 mm = 0,09). Không bắt buộc áp dụng transform: hệ thống
  đọc vị trí qua transform của object. Khi xuất, tích **Apply Modifiers**.
- **Hướng**: trục Y hướng lên (mặc định khi xuất glTF từ Blender), sản phẩm đứng trên mặt phẳng Y = 0, tâm
  đáy tại gốc toạ độ, mặt trước nhìn về +Z. **Túi đặt chính giữa gốc toạ độ**: mỗi mặt cân giữa theo chiều
  ngang; lệch quá 1 mm thì model bị từ chối.
- **Chiều cao ly** là điểm cao nhất của cả model, tính cả vành cuộn (đúng như chiều cao danh nghĩa của nhà sản
  xuất). Hệ thống kéo dài mặt nón của phần in xuống đáy và lên tới chiều cao đó để ra đường kính miệng, đường
  kính đáy và khoảng cách từ dải in tới miệng, tới đáy.
- **Phần được in là object (mesh) riêng**, đặt tên đúng, không có đuôi `.001`:
  - ly: `print:BODY`;
  - túi / hộp: `print:FRONT`, `print:BACK`, `print:LEFT`, `print:RIGHT` (mặt nào không in thì không cần).
    Miệng ly, đáy, quai, mặt trong, nắp… là object khác, giữ vật liệu riêng.
  - Mọi vùng in của quy cách phải có mesh tương ứng; thiếu một vùng thì model không được dùng.
  - Phần in dùng **một vật liệu**. Không để bản sao của thân ly nằm dưới phần in (nó sẽ lộ ra qua hình in).
  - Các mặt quay ra ngoài (Recalculate Outside). Mặt quay vào trong được hệ thống tự lật lại, kèm cảnh báo.
- **Hình dạng phần in**:
  - `print:BODY` là mặt tròn xoay quanh trục Y: vòng trên và vòng dưới là hai đường tròn đồng tâm trên trục
    Y (sai số ≤ 0,5 mm). Phần in **chính là dải được in** (không gồm mép cuộn, không gồm đáy).
  - `print:FRONT`… là hình chữ nhật phẳng (sai số ≤ 0,5 mm).
- **Không cần trải UV cho phần in.** Hệ thống tự tính toạ độ dán ảnh từ vị trí từng điểm (góc quanh trục và
  độ cao với ly; vị trí trên mặt với túi) và tự tách đường nối ở phía sau ly (−Z). UV có sẵn trong file bị bỏ
  qua. Mép của mesh in = mép cắt của vùng in (lề tràn nằm ngoài, studio tự lo).
- **Độ mịn của thân ly:** ít nhất 32 cạnh quanh thân, để hình không gãy khúc.
- **Vật liệu của phần in**: màu nền của giấy / nhựa (trắng, kraft, trong). Studio thay ảnh thiết kế vào kênh
  màu của vật liệu này.
- **Vật liệu của phần không in** (thành ly ngoài dải in, vành, đáy, mặt trong): giữ nguyên như trong file. Nên
  đặt cùng màu nền với phần in, nếu không model sẽ có một dải khác màu ở chỗ tiếp giáp.

Nên dựng thử một ly và kiểm bằng màn hình upload của back-office (mục "Cấu hình in" ở trang biến thể) trước khi
dựng model hàng loạt.

## 5. Các bước kiểm khi tải file (chạy trên trình duyệt, không cần BE)

1. **Kiểm hình.** `print:BODY` phải là mặt nón tròn xoay quanh trục Y; các mặt `print:FRONT`… phải phẳng và
   là hình chữ nhật; sai số tối đa 0,5 mm. Kiểm luôn định dạng, dung lượng, số tam giác, đơn vị (kích thước
   bất thường, ví dụ ly cao 90 mét, nghĩa là sai đơn vị). Không đạt: từ chối, nói rõ sai gì ở phần nào.
2. **Toạ độ dán ảnh do hệ thống tính** (không phải bước kiểm): vì UV của phần in được tính từ vị trí từng điểm
   bằng công thức của khuôn 2D, các lỗi trải UV sai, lật ngược, đường nối sai chỗ không xảy ra được. Công cụ chỉ
   kiểm thân ly đủ mịn (≥ 32 cạnh quanh thân).
3. **Đối chiếu với thông số nhà sản xuất.** Hiện số đo đọc được (ví dụ "miệng 90,0 mm, đáy 60,2 mm, cao phần
   in 95,0 mm") và khuôn 2D tính ra kèm kích thước mm, để người khai báo so với bảng thông số của nhà sản
   xuất. **Không bắt buộc:** gõ các số danh nghĩa từ bảng thông số; công cụ cảnh báo khi lệch quá 1 mm. Số gõ
   chỉ để kiểm chéo, khuôn 2D vẫn tính từ số đo của model.
4. **Xem thử ô lưới đánh số.** Công cụ dán một ô lưới có đánh số lên từng vùng in của model, để thấy hình có
   đúng chỗ, đúng chiều, đường nối ở phía sau không. Người khai báo xác nhận rồi mới kích hoạt.

5. **Giữ số đo và file thành một cặp.** Số đo chỉ được sinh từ file, không gõ tay; muốn đổi số đo thì tải file
   khác. Trước khi lưu, màn hình so từng phần in của file với cấu hình sắp lưu (đã tính các giá trị mặc định):
   lệch quá 1 mm thì không lưu được. Số đo và file được gửi trong một lần lưu. BE giữ cặp này bằng checksum của file (mục B-6 trong tài liệu
   yêu cầu cho BE).

**Thay đổi ngày 2026-11-13.** Phần đo và kiểm chỉ chạy ở back-office (repo `stockflow-ui`,
`src/features/product-design/model3d/`), nơi upload thông tin sản phẩm. Storefront không đo và không so file
với bộ số đo: nó tải file, dán hình và hiển thị; file lỗi thì dùng mẫu dựng từ số đo. Trang thử model từng làm
tạm ở storefront (`/design/model-check`) được gỡ theo kế hoạch chuyển; nội dung của nó thành màn hình upload ở
back-office.
Kế hoạch chuyển: `docs/superpowers/plans/2026-11-13-design-glb-tach-storefront-backoffice.md`.

## 6. Giá trị điền sẵn (mục "Nâng cao")

| Thông số            | Mặc định lấy từ đâu                                      | Khi nào sửa                                                          |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Lề tràn, lề an toàn | Mặc định theo loại sản phẩm (ly một bộ, túi một bộ)      | Khi nhà in yêu cầu khác                                              |
| Mép dán của ly      | Mặc định theo loại ly                                    | Khi khuôn của nhà sản xuất ly khác mặc định (không đo được từ model) |
| Ràng buộc file ảnh  | Mặc định chung của hệ thống (B34: 300 dpi, tối đa 50 MB) | Sản phẩm đặc biệt                                                    |
| Chất liệu nền       | Lấy từ thuộc tính "Chất liệu" của quy cách               | Không hỏi lại                                                        |

Các con số mặc định cụ thể (bao nhiêu mm) lấy từ nhà in / nhà sản xuất ly mà nhóm làm việc cùng. Dữ liệu
mẫu trong mock hiện dùng lề tràn 2–3 mm, lề an toàn 3–5 mm.

## 7. Luồng của người khai báo (back-office)

Theo docs (BR-21) người khai báo cấu hình in là Quản lý kinh doanh.

1. Mở quy cách → "Cấu hình in" → **tải file `.glb`**.
2. Hệ thống tự đọc và tự điền: loại sản phẩm, kích thước, vùng in; chạy kiểm hình. Sai thì báo
   lỗi cụ thể, không lưu.
3. Xem lại số đo so với bảng thông số nhà sản xuất (có thể gõ số danh nghĩa để kiểm chéo).
4. Xem thử ô lưới đánh số trên model.
5. (Khi cần) mở "Nâng cao" để sửa lề, mép dán, ràng buộc file.
6. Kích hoạt. Tải file `.glb` khác về sau tạo **phiên bản cấu hình in mới**; bản thiết kế đã làm giữ phiên bản
   cũ (BE đã có phiên bản cho template).

File tải lên qua quét virus ở BE (BR-18).

## 8. Storefront (studio của khách)

- Nạp `.glb` khi mở studio (tải khi cần, có khung chờ), dán ảnh của từng vùng in lên mesh `print:<MÃ>`.
- Khuôn 2D, vùng in, lề, "uốn theo thân ly", preflight, file in: dùng bộ số đo như hiện nay, không đổi.
- **Không tải được `.glb`** (mất mạng, file hỏng) hoặc quy cách **chưa có `.glb`**: studio vẫn thiết kế và gửi
  duyệt được; hiện 2D, và có thể hiện mẫu 3D dựng từ số đo làm phương án dự phòng (B36).
- Ảnh xem trước trong bộ file gửi duyệt và nút "Xem 3D" ở trang dự án dùng model `.glb` khi có.
- Storefront chạy trên mock: mock trả cấu hình in kèm file `.glb` mẫu và số đo ghi sẵn. Việc kiểm file Blender
  làm ở trang "Cấu hình in" của back-office (mục 5), không ở storefront.

## 9. Việc của từng bên

- **BE** (chi tiết ở `docs/superpowers/reports/2026-11-13-design-yeu-cau-bo-sung-cho-be.md`, phần B): nhận
  và lưu file `.glb` cho template (quét virus, kiểm định dạng và dung lượng), lưu bảng ghép vùng in ↔ mesh,
  trả link `.glb` cho storefront (trình duyệt tải được: CORS), giữ `.glb` theo phiên bản template. Cách tính
  vùng in, preflight, đóng dấu PDF: **không đổi**. Các bước kiểm ở mục 5 **không cần BE**.
- **Back-office (FE)**: màn hình tải `.glb`, phần đo và kiểm (dùng lại code của storefront), phần hiện khuôn
  2D tính ra, mục "Nâng cao", phần xem thử ô lưới.
- **Storefront**: nạp GLB, dán ảnh lên mesh, phương án dự phòng khi không có GLB, bỏ chặn kiểu `gltf` hiện
  nay; phần đo và kiểm model; công cụ thử model.
- **Người dựng model**: theo mục 4.

## 10. Hướng B (file khuôn 2D thật) — để sau

Khi cần hình không đo được từ model, hoặc khi nhà in cung cấp khuôn bế thật và muốn lấy nó làm chuẩn: thêm
kiểu cấu hình in nhận **file SVG khuôn** (kích thước thật theo mm, có `id="cut"` cho đường cắt và
`id="area-<MÃ>"` cho từng vùng in) đi cùng `.glb`. Lúc đó khuôn 2D là nguồn gốc, hệ thống so khuôn với số đo
của model (phần đo đã có sẵn từ hướng A). Chưa làm trong đợt này.

## 11. Câu hỏi còn mở

- Giá trị mặc định cụ thể của lề tràn, lề an toàn, mép dán: cần lấy từ nhà in / nhà sản xuất ly.
- Docs 01 §4.10 ghi cấu hình in gồm "khuôn 2D (bản trải phẳng theo kích thước thật)". Ở đây khuôn 2D được
  tính ra từ model, không tải lên: cần người phụ trách docs ghi nhận cách hiểu này.
- Ai chịu trách nhiệm model được dựng đúng kích thước thật của sản phẩm (bước đối chiếu ở mục 5 chỉ phát
  hiện, không sửa)?
