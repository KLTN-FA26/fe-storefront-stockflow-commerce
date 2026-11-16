# Module 12 — phần E (dự án thiết kế): báo cáo hoàn thành

Ngày: 2026-11-13. Nhánh: `feat/design-m12-a-foundation`. **Chưa commit**: mọi thay đổi nằm trong
index và trên đĩa để đọc lại và yêu cầu sửa. Spec:
`docs/superpowers/specs/2026-11-12-design-module12-e-projects-design.md`. Plan:
`docs/superpowers/plans/2026-11-12-design-module12-e-projects.md`.

## 1. Kết quả kiểm tra

| Kiểm tra                                           | Kết quả                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm run validate` (typecheck, lint, test, build) | Qua: typecheck sạch, lint 0 cảnh báo, 187 file / 2604 test, build thành công (chạy trên trạng thái cuối, sau mọi bản sửa)                                                                                  |
| Review từng task (task 1–10)                       | Mỗi task: review → sửa theo review → đưa vào index                                               |
| Review toàn bộ phần E (2 reviewer)                 | Không có lỗi nghiêm trọng; 7 lỗi quan trọng + 27 lỗi nhỏ → đã sửa, một số lỗi nhỏ để lại (mục 5) |
| Kiểm tra lại các bản sửa                           | Đạt; 5 lỗi nhỏ mới → sửa 4, để lại 1 (mục 5)                                                     |
| Trình duyệt (1440 px và 375 px)                    | Đạt, không có lỗi console (mục 3)                                                                |

## 2. Đã làm gì

- **Dự án thiết kế**: trang "Dự án" (`/design/projects`) cạnh "Thiết kế của tôi", tạo dự án, đổi tên
  tại chỗ, đóng dự án; trang dự án xếp các bản cạnh nhau, thêm bản sẵn có, tạo bản mới ngay trong dự
  án, gỡ bản; giới hạn 20 bản; dự án đã đóng chỉ xem. Thẻ bản thiết kế có nhãn tên dự án.
- **Thư viện dự án**: ảnh (tối đa 30) và mẫu chữ (tối đa 30). Trên trang dự án: tải ảnh, xoá. Trong
  studio: nhóm "Thư viện dự án" ở bảng Ảnh (bấm hoặc kéo vào khung vẽ; máy chủ sao chép vào bản, kiểm
  theo ràng buộc file của quy cách), nhóm "Mẫu chữ của dự án" ở bảng Chữ, hai mục "Lưu thành mẫu chữ
  của dự án" và "Lưu ảnh vào thư viện dự án" trong "Thêm". Header studio hiện "Dự án X › tên bản".
- **Nhân bản sang cỡ khác**: nút trên thẻ bản; chỉ nhận variant khác của cùng product có cấu hình in;
  bố cục được co giãn theo vùng in mới; ảnh được sao chép sang bản mới.
- **Gửi duyệt cả bộ**: chọn từ 2 bản nháp trên trang dự án → trang riêng (chỉ máy tính) chạy kiểm tra
  → xác nhận → dựng file và tải lên từng bản → mở lượt duyệt bằng một lệnh. Một bản không đạt thì không
  bản nào được gửi. Có thử lại, huỷ, cảnh báo khi rời trang.
- **Giả lập người duyệt**: mục "Lượt duyệt dự án" trong bảng "Giả lập": duyệt / trả lại từng bản,
  "Duyệt tất cả", công tắc "lần duyệt kế tiếp sẽ lỗi"; lượt tự đóng khi mọi bản có quyết định.
- **Bộ chạy gửi duyệt tách khỏi studio**: nút "Gửi duyệt" trong studio dùng chung bộ chạy này; các
  test gửi lẻ cũ không bị sửa và vẫn qua.

## 3. Đã kiểm tra trên trình duyệt

Đã thử (dữ liệu mock, kể cả dữ liệu IndexedDB có từ trước phần E):

- Trang danh sách dự án với dữ liệu cũ: hiện "chưa có dự án", không lỗi.
- Tạo dự án "Chi nhánh Q1 (thử)" → sang trang dự án; thêm 2 bản sẵn có ("2/20 bản").
- Chọn 2 bản → trang gửi duyệt cả bộ: cả hai đạt (có lưu ý CMYK) → xác nhận → dựng và tải lên có
  tiến độ từng dòng → về trang dự án: cả hai "Chờ duyệt", dải "còn 2 bản đang chờ", nút "Đóng dự
  án" bị khoá kèm lý do.
- Giả lập: bật công tắc lỗi cho túi rồi "Duyệt tất cả" → ly "Đã duyệt", túi vẫn "Chờ duyệt" kèm lý
  do tiếng Việt, dải "còn 1 bản đang chờ"; bấm lần nữa → lượt đóng, dải biến mất.
- Studio của bản thuộc dự án (chỉ xem): header "Dự án › Dự án Chi nhánh Q1 (thử) › tên bản".
- Bề rộng điện thoại 375 px: trang dự án không tràn ngang.
- "Xem 3D": hiện ảnh dựng của mẫu 3D có chữ đúng.

**Chưa thử trên trình duyệt** (chỉ có test tự động): studio của bản nháp thuộc dự án (đặt ảnh từ thư
viện, lưu mẫu chữ / ảnh), hộp thoại nhân bản, tải ảnh lên thư viện trên trang dự án, trang dự án đã
đóng. Dự án thử "Chi nhánh Q1 (thử)" và hai bản đã duyệt trong đó vẫn còn trong dữ liệu mock của
trình duyệt; muốn xoá thì dùng "Xoá dữ liệu mock" trong bảng "Giả lập".

## 4. Các quyết định tôi tự đưa ra (khác hoặc bổ sung so với spec)

- **Trang gửi duyệt cả bộ là trang riêng, chỉ mở trên máy tính** (không phải hộp thoại): phông chữ
  chỉ được nạp ở nhóm trang studio, mà dựng file in cần phông thật.
- **"Xem 3D" trên trang dự án là ảnh dựng sẵn, không xoay được**: khung 3D xoay được gắn với studio.
- **Tab Chữ trên trang dự án** hiện nội dung bằng phông thường kèm tên phông, cỡ, ô màu; trong studio
  mẫu chữ hiện đúng phông.
- **Lịch sử dự án ghi thêm ba sự kiện theo docs §5.4** mà spec bỏ sót: gửi cả bộ thành công, có bản
  không đạt kiểm tra, lượt duyệt đóng.
- **Chỉ bản thuộc dự án mới đặt được ảnh từ thư viện của dự án đó**; lưu ảnh vào thư viện cũng yêu
  cầu bản nguồn thuộc dự án.
- **Lệnh nhân bản có khoá chống trùng**: bấm thử lại sau lỗi mạng không tạo hai bản.
- **Thêm / gỡ bản khỏi dự án không đổi phiên bản của bản** (BR-17: không đổi nội dung), nên studio
  đang mở không bị từ chối khi tự lưu.
- **Gỡ bản khỏi dự án đã đóng bị từ chối** (docs §5.4: dự án đóng không thêm / gỡ bản).
- **Mỗi phông và ảnh chỉ được chờ tối đa 15 giây** khi gửi cả bộ; quá hạn thì bản đó báo không đạt
  thay vì treo.
- **Dải "lượt duyệt đang mở"** lấy lượt cũ nhất còn mở và chỉ đếm các bản còn chờ.
- **Hằng số đường dẫn** nằm ở `src/constants/routes.ts` (plan ghi nhầm thư mục).

## 5. Còn tồn (đã biết, để lại)

- **Dữ liệu thử nhân bản sang cỡ khác**: trong mock catalogue, mỗi cỡ ly là một product riêng; variant
  cùng product chỉ khác màu / chất liệu và cùng khuôn. Nhân bản chạy được nhưng chỉ ra cùng cỡ. Muốn
  thử 500 ml → 700 ml cần thêm product có trục Dung tích vào `src/lib/mock-data.ts` (file chung của
  catalog) — **chờ bạn cho phép**.
- **Lối "Gửi duyệt cả bộ…" ngay trong studio**: đã đề xuất, chưa làm (chờ bạn quyết).
- **Khi nhân bản sang cỡ lớn hơn**, phần tử gần kín dải in có thể tràn mép cắt; preflight của bản mới
  sẽ báo.
- **Hai lượt duyệt cùng mở** (tình huống hiếm): thử lại một lượt trẻ hơn có thể gặp lỗi "bản đang chờ
  duyệt".
- **Chưa có màn hình xem lịch sử dự án**: các sự kiện đã được ghi, hook đọc đã có, chưa hiển thị.
- **Sau khi đặt ảnh từ thư viện, bảng Ảnh tự đóng** (giữ như hành vi cũ khi đặt ảnh).
- **Vài file dài hơn khuyến nghị** chưa tách: các file mock của dự án và lượt duyệt, `mock-design.ts`,
  và ba file `submit-set-*`.
- **File PDF trong thư viện** chưa hỗ trợ (mock chỉ nhận PNG, JPG; SVG được đổi sang PNG).
- **Báo giá cả dự án** (docs §4.11): ngoài phạm vi, chờ phần D.

## 6. Lộ trình module 12

| Phần                                                                    | Tình hình                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A — Nền tảng và vòng đời                                                | Xong, đã commit                                                         |
| Việc thêm sau A (bố cục studio, in uốn chính xác, ánh sáng 3D, sửa lỗi) | Xong, đã commit                                                         |
| **E — Dự án thiết kế**                                                  | **Xong, đã qua review và validate; chưa commit, chờ bạn đọc lại**       |
| Gói nâng cấp kiểu Canva (mục 1–9)                                       | Spec và plan đã duyệt; **chưa làm**, chờ bạn bảo (nên chạy ở phiên mới) |
| B — Cấu hình in (file khuôn thật, model GLB)                            | Chưa làm                                                                |
| C — Bộ file xuất (PDF/X-4, hướng dẫn sản xuất…)                         | Làm một phần                                                            |
| D — SKU riêng, yêu cầu báo giá                                          | Chưa làm                                                                |

## 7. Nếu muốn commit

Toàn bộ phần E đã ở trong index (kèm spec, plan của phần E và của gói Canva, và file báo cáo này).
Gợi ý thông điệp: `feat(design): design projects — library, clone to another size, submit the whole
set`. Không có dòng Co-Authored-By theo quy ước của repo.
