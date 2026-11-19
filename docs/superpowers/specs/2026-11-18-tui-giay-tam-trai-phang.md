# Túi giấy: cấu hình mép dán, gấp đáy và file in một tấm trải phẳng (FE)

Ngày: 2026-11-18. Trạng thái: **đặc tả để làm**, đã chốt phương án B với chủ dự án.
Phạm vi: chỉ FE (storefront `stockflow-storefront` và back-office `stockflow-ui`). Phần BE cần làm cho khớp nằm ở
`docs/superpowers/reports/2026-11-18-design-gui-be-file-in-va-tui-giay.md`.

## 1. Vì sao

Túi giấy ngoài xưởng được **in trên một tấm liền**, rồi bế, gấp thành ống, dán mép dọc và gấp đáy. Hiện nay:

- cấu hình in của túi chỉ có `widthMm`, `gussetMm`, `heightMm`, `topFoldMm`, `handle`, `material` (cột JSON
  `model_params_json` của `CustomizationTemplate`), **chưa có mép dán và phần gấp đáy**;
- file in `PRINT_READY` của túi là **4 trang rời** (FRONT, BACK, LEFT, RIGHT), nhà in phải tự ghép.

Sau thay đổi: cấu hình in túi có thêm 2 số **lưu thật, sửa được** (như `seamMm` của ly), và file in của túi là
**một trang tấm trải phẳng** có đường bế, nếp gấp, mép dán, phần gấp miệng và gấp đáy. Studio vẫn cho khách thiết kế
từng mặt như hiện nay.

## 2. Dữ liệu: hai trường mới trong mô hình túi

Thêm vào `BagModel` (khoá trong JSON `model_params_json`, **không đổi bảng**):

| Trường         | Nghĩa                                                              | Kiểu, giới hạn            | Gợi ý điền sẵn (back-office)                 |
| -------------- | ------------------------------------------------------------------ | ------------------------- | -------------------------------------------- |
| `glueFlapMm`   | Mép dán dọc: dải được dán đè khi cuộn tấm thành ống                | số mm, `0 ≤ x ≤ 100`      | **20**                                       |
| `bottomFoldMm` | Độ sâu phần gấp đáy: đoạn giấy dưới mặt túi được gấp lại thành đáy | số mm, `0 ≤ x ≤ gussetMm` | **`round2(0,6 × gussetMm)`** (hông 120 → 72) |

- Cả hai **không đo từ file `.glb`** (giống `topFoldMm`): Quản lý kinh doanh nhập hoặc giữ gợi ý, sửa được bất cứ lúc
  nào mà không cần file mới.
- ⚠️ **Giả định**: hai giá trị gợi ý là số tạm, chờ xưởng (bộ phận chung của công ty) xác nhận khuôn thật.
- **Bản ghi cũ** chưa có hai khoá: FE và BE cùng coi như bằng giá trị gợi ý trên (`glueFlapMm = 20`,
  `bottomFoldMm = round2(0,6 × gussetMm)`). FE ghi rõ "giả định" ở dải thông tin và file mô tả khi đang dùng giá trị
  mặc định vì bản ghi chưa có.
- `round2` = làm tròn 2 chữ số thập phân, như BE đang làm với vùng in.

## 3. Hình học tấm trải phẳng (FE và BE phải tính giống hệt)

Ký hiệu (mm): `W = widthMm`, `g = gussetMm`, `H = heightMm` (đã gồm gấp miệng), `T = topFoldMm`,
`G = glueFlapMm`, `B = bottomFoldMm`, `P = round2(H) − round2(T)` (chiều cao in được của mỗi mặt, như hiện nay),
`b = max(bleedMm của 4 vùng in)`.

Khổ ngang, gốc toạ độ ở góc trên-trái **vùng thành phẩm (trim)**, x sang phải, y xuống dưới:

```
x:  0        G         G+W       G+W+g      G+2W+g     G+2W+2g = Wt
    ┌────────┬─────────┬─────────┬──────────┬──────────┐ y = 0
    │  gấp miệng (T) — không in                         │
    ├────────┼─────────┼────┊────┼──────────┼────┊─────┤ y = T        ← nếp gấp miệng
    │ mép    │  FRONT  │RIGHT┊   │  BACK    │LEFT ┊    │
    │ dán (G)│  W × P  │g × P┊   │  W × P   │g × P┊    │
    ├────────┼─────────┼────┊────┼──────────┼────┊─────┤ y = T + P    ← nếp gấp đáy
    │  gấp đáy (B) — không in, trừ phần lề tràn của mặt  │
    └────────┴─────────┴─────────┴──────────┴──────────┘ y = T + P + B = Ht
```

- **Thành phẩm (trim)**: `Wt = G + 2W + 2g`, `Ht = T + P + B`.
- **Vùng lề tràn (bleed box)**: `(Wt + 2b) × (Ht + 2b)`, trim nằm ở `(b, b)` trong đó.
- **Vị trí từng mặt** (góc trên-trái trim của mặt, trong toạ độ trim của tấm):

  | Mặt   | x            | y   | rộng | cao |
  | ----- | ------------ | --- | ---- | --- |
  | FRONT | `G`          | `T` | `W`  | `P` |
  | RIGHT | `G + W`      | `T` | `g`  | `P` |
  | BACK  | `G + W + g`  | `T` | `W`  | `P` |
  | LEFT  | `G + 2W + g` | `T` | `g`  | `P` |

  Thứ tự này theo cách gấp ống: nhìn từ mặt trước, hông phải ở bên phải; mép dán gắn với cạnh trái mặt trước và được
  cạnh phải hông trái dán đè lên.

- **Đường bế** (`CutContour`): hình chữ nhật trim `(0, 0, Wt, Ht)`.
- **Nếp gấp** (lớp hướng dẫn, không in): dọc tại `x = G, G+W, G+W+g/2, G+W+g, G+2W+g, G+2W+1,5g`; ngang tại
  `y = T` và `y = T + P` (cả chiều rộng).
- **Vùng không in**: mép dán, gấp miệng, gấp đáy (để trơn giấy).
- **Nội dung mỗi mặt** được cắt (clip) theo trim của mặt đó, chỉ **tràn thêm `b`** ở:
  - cạnh dưới (xuống phần gấp đáy, để màu không hở ở nếp gấp đáy);
  - cạnh phải của LEFT (nằm trên đường bế ngoài).

  Giữa hai mặt liền nhau là nếp gấp, nội dung hai bên chạm sát nhau, không chồng.

Ví dụ kiểm tra (túi kraft size M, mock `BAGM-4F`): `W = 260`, `g = 120`, `H = 320`, `T = 40`, `G = 20`,
`B = 72`, `b = 3` → `P = 280`, `Wt = 780`, `Ht = 392`, bleed box `786 × 398` mm.

## 4. Storefront (`stockflow-storefront`) sẽ làm

### 4.1. Dữ liệu và hình học

- `engine/template/schema.ts`: `bagModelSchema` thêm `glueFlapMm`, `bottomFoldMm` (số ≥ 0, **không bắt buộc** để đọc
  được bản ghi cũ).
- `engine/surfaces/bag-sheet.ts` (mới): `bagSheet(model, printAreas)` trả về trim, bleed box, vị trí 4 mặt, nếp gấp,
  vùng mép dán / gấp miệng / gấp đáy, cờ `assumed` khi dùng giá trị mặc định. Test ghim bằng số ví dụ ở §3.
- `src/lib/api/mock-fixtures/design-print-configs.ts`: mẫu túi có hai trường mới; một mẫu cũ không có để thử nhánh
  mặc định.

### 4.2. File in `PRINT_READY` của túi

- **Một trang** thay vì 4: BleedBox = bleed box của tấm, TrimBox = trim tấm, MediaBox = BleedBox + lề trắng 5 mm
  (trái, phải, trên) + dải thông tin 14 mm (dưới) — cùng quy tắc với ly.
- Nội dung 4 mặt đặt đúng vị trí §3, vẫn **vector, mỗi phần tử một lớp**; tên lớp có tên mặt
  (ví dụ `Mặt trước · 2 · Chữ “…”`). Trang nào của một mặt không vẽ được vector thì mặt đó chèn dạng ảnh 300 DPI
  đúng vị trí (các mặt khác vẫn vector).
- `CutContour` = hình chữ nhật trim; lớp hướng dẫn (tắt) có nếp gấp, vùng an toàn từng mặt, khung mép dán.
- Dải thông tin: `Tấm trải phẳng Wt × Ht mm · Lề tràn b mm · Mép dán G mm · Gấp miệng T mm · Gấp đáy B mm`, thêm
  `(mép dán, gấp đáy: giả định)` khi bản ghi chưa có hai trường.
- Tên file, vai trò, kiểu nội dung giữ nguyên.

### 4.3. File mô tả `TECHNICAL_SPEC`

- Thêm trang **"Tấm trải phẳng"**: hình tấm với 4 mặt (ảnh thu nhỏ), nếp gấp, đường bế, ghi kích thước `G, W, g, T,
P, B, Wt, Ht`; ghi chú thứ tự gấp và mặt nào dán đè lên mép dán.
- Các trang từng mặt giữ như hiện nay (vị trí phần tử đo từ mép trên và giữa mặt).

### 4.4. Đối chiếu BE (sửa luôn trong đợt này)

- **Gửi duyệt cả bộ**: đọc `details.designs[{designId, errorCode}]` thay vì chỉ `details.designIds`; sửa chú thích cũ
  nói BE kiểm version trước status (`api.ts`, `api-projects.ts`, `components/submit-set-run.ts`, `project-dtos.ts`).
- **Mock** khớp BE: kiểm status trước version (một bản và cả bộ), mã lỗi cả bộ theo thứ tự NOT_FOUND → DESIGN_NOT_DRAFT
  → CONFLICT kèm `details.designs`, bản ngoài dự án được nêu tên thay vì 404 trần; kiểm khổ trang file in như
  `PrintFileGeometry` (sau khi BE sửa); giữ mọi lần tải file thay vì một file mỗi vai trò. Sửa các test đang dựa vào
  hành vi cũ (`review-rounds-api.test.tsx`).
- **Còn nhận thiết kế / quy cách thùng**: khi BE trả `designable` và `hasCartonSpec` trên `GET /designs/{id}/template`
  thì đọc thẳng từ đó; **trong lúc chờ**, quy cách "không có trong danh sách catalog" được coi là **chưa biết** (cảnh
  báo `note`) thay vì `fail`, để không chặn những bản BE vẫn nhận.

## 5. Back-office (`stockflow-ui`) sẽ làm

- Form cấu hình in của túi (`PrintDefaultsForm.tsx`, `print-defaults.ts`, `save-input.ts`, `schemas.ts`):
  thêm ô **"Mép dán (mm)"** và **"Phần gấp đáy (mm)"**, điền sẵn gợi ý §2, kiểm tra trước khi gửi
  (`0 ≤ glueFlapMm ≤ 100`, `0 ≤ bottomFoldMm ≤ gussetMm`). Nhãn ở `labels-print-config.ts`, giá trị gợi ý ở
  `constants/numbers.ts`.
- Không đo từ `.glb`: hai số không nằm trong danh sách "số file quyết định" (`ModelFileRules` phía BE,
  `compare-template.ts` phía FE), sửa không cần file mới.
- `save-error.ts`: ánh xạ `model.glueFlapMm`, `model.bottomFoldMm` về hai ô (khi BE trả `fieldErrors`).
- Hình xem trước **tấm trải phẳng** trong form (vẽ theo §3, cập nhật khi gõ số).
- Đối chiếu BE (cùng đợt): kiểm tra trước các luật BE đang có mà form chưa kiểm — `seamMm ≤ 100`, góc quét + mép dán
  của ly < 2π, lề tràn < bán kính trong, `safeMarginMm ≤ 500`, `2 × safeMargin < min(rộng, cao)` mỗi vùng in, đáy ly
  không rộng hơn miệng, các số ≤ 2000; sửa chú thích và thông điệp cũ về kích hoạt (409
  `PRINT_CONFIG_MODEL_FILE_REQUIRED`).

## 6. Không làm trong đợt này

- Thiết kế liền một tấm (hình chạy qua nếp gấp) trong studio.
- Lỗ quai, quai dán, đáy có rãnh bế (khuôn SOS đầy đủ) — chờ dieline thật của xưởng.
- Lót trắng cho kraft nâu (chỉ ly PET đã có).
