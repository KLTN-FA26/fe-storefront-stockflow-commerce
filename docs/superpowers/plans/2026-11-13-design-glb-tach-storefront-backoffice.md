# Tách phần model 3D `.glb`: storefront chỉ hiển thị, back-office đo và kiểm (plan chuyển đổi)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Storefront chỉ còn việc tải file `.glb`, dán hình thiết kế lên và hiển thị. Mọi việc đo, kiểm
và sinh số đo 2D từ file chuyển sang back-office, nơi upload thông tin sản phẩm.

**Cách làm:** Chép phần đo và kiểm sang repo back-office trước, có test giữ nguyên kết quả trên file ly mẫu.
Sau đó mới gỡ khỏi storefront. Hai repo không có gói dùng chung, nên phần code cả hai bên cần được chép làm hai
bản, giữ đồng bộ bằng cùng một file mẫu và cùng một bộ số mong đợi.

**Hai repo:**

- Storefront: `D:\FPTU\Capstone\UIDesign\stockflow-storefront`, nhánh `feat/design-m12-a-foundation`. Phần GLB
  đang staged cùng phần E, chưa commit.
- Back-office: `D:\FPTU\Capstone\UIDesign\stockflow-ui`, nhánh `develop`. Next 16, cùng stack; đã có `three`,
  `@react-three/fiber`, `@react-three/drei`. Chưa có màn hình nào cho cấu hình in.

**Căn cứ:** quyết định của chủ dự án ngày 2026-11-13: upload file 3D ở back-office sinh ra số đo 2D, số đo đó
được so với số của nhà sản xuất; storefront không kiểm. Các tài liệu liên quan:
`docs/superpowers/specs/2026-11-13-design-storefront-glb-model.md`,
`docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md`,
`docs/superpowers/reports/2026-11-13-design-yeu-cau-bo-sung-cho-be.md`.

---

## 1. Phân chia

### 1.1. Giữ ở storefront

| Việc                                                                 | File (`src/features/product-design/…`)                                            |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Trường `model3d` của cấu hình in; dữ liệu sai thì bỏ qua và cảnh báo | `engine/model3d/schema.ts`, `schemas.ts`                                          |
| Tải `.glb`, đổi mét sang mm, nhớ file đã tải                         | `engine/model3d/load.ts`, `dispose.ts`                                            |
| Tìm mesh in theo tên (`print:BODY`…)                                 | `engine/model3d/find-print-meshes.ts` (bỏ phần cảnh báo tên gần đúng)             |
| Tính vị trí dán hình, quay mặt ra ngoài, tách đường nối              | `engine/model3d/print-uv.ts`                                                      |
| Dựng cảnh từ file                                                    | `engine/model3d/scene.ts` (rút gọn, xem Task S2)                                  |
| Viewer đổi sang model thật, lỗi thì giữ mẫu dựng bằng code           | `engine/viewer3d/product-viewer.ts`, `model3d-swap.ts`                            |
| Dòng trạng thái trong studio                                         | `components/studio/model3d-status.tsx`, `viewer-3d.tsx`                           |
| Ảnh xem trước, "Xem 3D", gửi duyệt cả bộ chờ model                   | `components/studio/preview-export.ts`, `deadline.ts`, `submission-bundle.ts`…     |
| Quy cách mock có `model3d`, file ly mẫu và script sinh ra nó         | `src/lib/api/mock-fixtures/design-print-configs.ts`, `public/models/`, `scripts/` |

### 1.2. Chuyển sang back-office, gỡ khỏi storefront

| Việc                                                    | File ở storefront hôm nay                                                                                                      | Số dòng                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Đo ly và túi từ file                                    | `engine/model3d/measure.ts`, `measure-cup.ts`, `measure-bag.ts`, `measure-points.ts`, `measure-types.ts`, `measure-winding.ts` | 737                        |
| Danh sách lỗi và cảnh báo, so với số nhà sản xuất       | `engine/model3d/issues.ts`                                                                                                     | 144                        |
| So file với bộ số đo                                    | `engine/model3d/compare-template.ts`                                                                                           | 75                         |
| Sinh cấu hình in (khuôn, lề, mép dán mặc định) từ số đo | `engine/model3d/template-from-model.ts`                                                                                        | 128                        |
| Trang thử model và lưới đánh số                         | `components/model-check/*` (14 file), `src/app/(studio)/design/model-check/*`                                                  | khoảng 1.400 không kể test |
| Đường dẫn tới trang thử                                 | `components/mock-review-panel.tsx`, `STORE_ROUTES.design.modelCheck`                                                           | vài dòng                   |
| Test của các phần trên                                  | `model3d-measure.test.ts`, `template-from-model.test.ts`, `model3d-sample-roundtrip.test.ts`, test của model-check             |                            |

### 1.3. Cả hai bên đều cần (chép thành hai bản)

| Việc                                                                     | Vì sao back-office cũng cần                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `load.ts`, `dispose.ts`                                                  | Đọc file `.glb` người khai báo vừa chọn                            |
| `find-print-meshes.ts`                                                   | Tìm phần in để đo; back-office giữ thêm phần cảnh báo tên gần đúng |
| `print-uv.ts` cùng phép tính khuôn (`engine/surfaces/cup.ts`, `rect.ts`) | Chỉ cần nếu back-office có bước xem thử lưới đánh số (Task B4)     |
| `public/models/sample-cup-12oz.glb`                                      | File mẫu chung; hai bên cùng test trên nó                          |

### 1.4. Hành vi của storefront sau khi tách

- Có `model3d` → tải file → tìm đủ mesh của mọi vùng in → dán hình → đổi model.
- Thiếu mesh, file hỏng, tải lỗi hoặc quá 15 giây → giữ mẫu dựng bằng code từ các trường kích thước, hiện dòng
  báo, ghi `console.warn`. Thiết kế, lưu và gửi duyệt không bị chặn. Phần này không đổi.
- **Không còn** đo file, không còn so file với bộ số đo, không còn mã lỗi `MODEL_MISMATCH`.
- Hệ quả phải chấp nhận: nếu số đo và file không còn là một cặp (số đo bị sửa mà file không đổi, file sai đơn
  vị lọt qua), storefront vẫn hiện file đó và hình trên 3D sai chỗ mà không báo. File in vẫn đúng. Việc chặn
  thuộc về back-office (Task B3) và BE (Task S4).

---

## Ràng buộc chung

- pnpm ở cả hai repo. Không đọc hay sửa `.env*`. Không `git stash`. Không commit, không push khi chưa được bảo.
- Storefront: không sửa `src/lib/mock-data.ts`, `components/ui/*`, `src/_design/*RULES.md`; không hex, không px
  trần; lời hiển thị bằng tiếng Việt.
- Back-office: theo `CLAUDE.md` và `.claude/rules/` của `stockflow-ui`: Mode A kiểu Vercel; 7 file bắt buộc
  của một feature; file feature ≤ 200 dòng, component ≤ 150, `page.tsx` ≤ 60; nhãn vào `UI_LABELS`, route vào
  `ADMIN_ROUTES`, ngưỡng và dung sai vào `constants/numbers.ts` có ghi nguồn; không `any`, không `!`; thứ tự
  import theo quy định; `features/A` không import `features/B`.
- Các ngưỡng giữ nguyên giá trị khi chép: dung sai hình 0,5 mm; dung sai so số 1 mm; ly cao 20–400 mm; túi cao
  20–600 mm; ít nhất 32 cạnh quanh thân; tối đa 100.000 tam giác; 10 MB; mặc định mép dán 8 mm, vành 3 mm; ly:
  lề an toàn 3, tràn lề 2; túi: lề an toàn 5, tràn lề 3.
- Không viết lại thuật toán khi chép. Chỉ đổi đường dẫn import, chỗ đặt hằng số và nhãn cho hợp quy định của
  back-office. Mỗi file chép ghi một dòng nguồn gốc ở đầu file.
- Mỗi repo chạy `pnpm run validate` trước khi báo xong phần của mình.

## Trọng tâm review

1. Kết quả đo ở back-office phải bằng kết quả ở storefront hôm nay trên cùng file: ly mẫu ra 90 / 60 / 110, lề
   6 và 8, khuôn 230,04 / 327,05 / 0,84894 rad, hộp 279,67 × 120,85.
2. Sau khi rút gọn, storefront vẫn dán hình đúng chỗ trên ly mẫu (lệch dưới 0,01 mm so với mẫu dựng bằng
   code) và `pick` trả đúng điểm.
3. File lỗi ở storefront vẫn quay về mẫu dựng bằng code, kể cả mesh in không có toạ độ hoặc có nhiều vật liệu.
4. Quy cách không có `model3d` không đổi gì ở cả hai bên.
5. Không còn gì ở storefront import phần đã gỡ; three.js không lọt vào trang không có 3D ở cả hai repo.

---

## Phần 1 — Storefront (repo này)

### Task S1: Giữ lại bản đầy đủ trước khi gỡ

Phần sắp gỡ chưa có trong commit nào. Gỡ trước khi lưu là mất.

- [ ] Chủ dự án chọn một trong hai:
  - **(Nên chọn)** commit trạng thái đang staged thành một hoặc hai commit (phần E, phần GLB đầy đủ), rồi mới
    gỡ ở commit sau. Lịch sử giữ nguyên bản đầy đủ.
  - Không commit: xuất bản vá `git diff --cached -- <các file ở mục 1.2 và 1.3>` ra
    `docs/superpowers/patches/2026-11-13-glb-do-kiem.patch`, kèm danh sách file.
- [ ] Kiểm: bản vá áp được lên một thư mục trống (`git apply --check`), hoặc commit có đủ mọi file ở mục 1.2 và
      1.3.

### Task S2: Rút gọn phần dựng cảnh

**File:** sửa `engine/model3d/scene.ts`, `find-print-meshes.ts`, `load.ts` (chỉ kiểu lỗi), `index.ts`,
`engine/index.ts`; sửa test `engine/__tests__/model3d-scene.test.ts`, `product-viewer.test.ts` (chỉ chỗ dùng mã
lỗi đã bỏ).

**Kết quả:**

- `buildGlbScene(root, ref, model, surfaces): ModelScene` giữ nguyên chữ ký. Bên trong: với mỗi vùng in của mẫu,
  tìm mesh bằng `findPrintObjects(root)`; thiếu, là nhóm rỗng hoặc nhiều vật liệu → `MESH_MISSING` kèm tên vùng
  in; `printGeometry` ném lỗi (mesh không có toạ độ…) → `INVALID_MODEL`. Không gọi `measureModel`, không gọi
  `templateDifferences`.
- `Model3dErrorCode` còn `LOAD_FAILED | ABORTED | MESH_MISSING | INVALID_MODEL`. `Model3dError.issues` bỏ.
- `find-print-meshes.ts`: bỏ phần tên gần đúng; giữ tên gốc trong `userData.name`, dạng lỏng cho tên đã bị
  thư viện đổi, nhóm chứa một mesh.
- Vẫn tính trước toàn bộ `printGeometry` rồi mới đụng vào cây: lỗi giữa chừng thì `root` nguyên vẹn.

- [ ] Test trước, trên file ly mẫu và cây dựng trong bộ nhớ: dựng được cảnh với mẫu `cup12oz`; vị trí và UV tại 6
      điểm (có hai điểm cách đường nối 0,3 mm) bằng mẫu dựng bằng code trong 0,01 mm; thiếu mesh → `MESH_MISSING`;
      mesh in không có toạ độ → `INVALID_MODEL` và `root` không đổi; `print:BODY` hai vật liệu → `MESH_MISSING`;
      mẫu có hai vùng in mà file chỉ có một → `MESH_MISSING` nêu tên vùng thiếu; file lệch 5 mm so với mẫu **vẫn
      dựng được** (ghi rõ trong tên test rằng storefront không so nữa).
- [ ] Viewer: `failed` với ba mã còn lại; các test đổi model, giữ góc xoay, huỷ, giải phóng vẫn xanh.
- [ ] `pnpm exec vitest run src/features/product-design/engine`.

### Task S3: Gỡ phần thuộc back-office

**File xoá:** `engine/model3d/measure.ts`, `measure-cup.ts`, `measure-bag.ts`, `measure-points.ts`,
`measure-types.ts`, `measure-winding.ts`, `issues.ts`, `compare-template.ts`, `template-from-model.ts`; cả thư mục
`components/model-check/`; `src/app/(studio)/design/model-check/`; test `model3d-measure.test.ts`,
`template-from-model.test.ts`, `model3d-sample-roundtrip.test.ts`.
**File sửa:** `engine/model3d/index.ts`, `engine/index.ts` (bỏ export), `src/constants/routes.ts` (bỏ
`modelCheck`), `components/mock-review-panel.tsx` và test của nó (bỏ đường dẫn "Thử model 3D").

- [ ] Chỉ làm sau khi Task S1 xong và Task B1 đã xanh ở back-office.
- [ ] `grep` không còn `measureModel`, `templateDifferences`, `templateFromModel`, `compareWithNominal`,
      `model-check`, `modelCheck` trong `src/`.
- [ ] `pnpm run validate`.

### Task S4: Tài liệu và yêu cầu cho BE

- [ ] `docs/superpowers/specs/2026-11-13-design-storefront-glb-model.md`: thêm mục "Thay đổi 2026-11-13": mục 5
      và mục 6 chuyển sang back-office; mục 8 bỏ `MODEL_MISMATCH`.
- [ ] `docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md`: mục 5 ghi rõ các bước kiểm chạy ở
      back-office lúc upload; trang thử model nằm ở back-office.
- [ ] `docs/superpowers/reports/2026-11-13-design-yeu-cau-bo-sung-cho-be.md`: thêm một yêu cầu: **số đo và file
      `.glb` lưu thành một cặp**. BE không nhận sửa số đo của mẫu (đường kính, chiều cao, vị trí dải in, kích
      thước mặt túi) mà không kèm file mới hoặc xác nhận đo lại; trả về checksum của file trong cấu hình in.
      Lý do: storefront không còn kiểm.
- [ ] Kiểm trên trình duyệt: studio với ly 12oz hiện model thật, hình đúng chỗ; chặn file thì hiện dòng báo;
      `/design/model-check` trả trang không tìm thấy.

---

## Phần 2 — Back-office (`stockflow-ui`, nhánh mới từ `develop`)

Thư mục feature: `src/features/product-design/` (trùng tên module 12 trong docs). Phần đo đặt ở
`src/features/product-design/model3d/`. Màn hình nằm ở trang biến thể `/admin/variants/[id]`, vì cấu hình in của
BE gắn theo biến thể (`/products/{productId}/variants/{variantId}/customization-templates`). `features/product`
không import feature mới: trang ghép hai phần lại.

### Task B1: Chép phần đo và kiểm

**File tạo (`src/features/product-design/model3d/`):** `load.ts`, `dispose.ts`, `find-print-meshes.ts` (bản đầy
đủ, có tên gần đúng), `measure.ts`, `measure-cup.ts`, `measure-bag.ts`, `measure-points.ts`, `measure-types.ts`,
`measure-winding.ts`, `issues.ts`, `compare-template.ts`, `template-from-model.ts`, `model-types.ts` (kiểu
`CupModel`, `BagModel`, `PrintAreaCode` và zod của chúng, chép từ `engine/template/schema.ts` của storefront),
`cup-sector.ts` (phép tính hình quạt, chép từ `engine/surfaces/cup.ts`), `index.ts`.
**Hằng số:** các ngưỡng ở mục Ràng buộc chung vào `src/constants/numbers.ts`, ghi nguồn là tài liệu quy ước.
**Nhãn:** câu báo lỗi tiếng Việt vào `src/constants/` theo cách đặt nhãn của repo.
**Test:** chép `model3d-measure.test.ts`, `template-from-model.test.ts`, phần `loadGlb` của
`model3d-scene.test.ts`; chép `sample-cup-12oz.glb` vào `public/mock/models/`.

**Giao tiếp giữ nguyên:**
`loadGlb(source, { signal? })`, `measureModel(root, { byteLength? }, defaults?) → { kind, model, printMeshes, issues }`,
`compareWithNominal(model, nominal)`, `templateFromModel(model, printMeshes, defaults?)`,
`templateDifferences(target, model)`.

- [ ] Test trước: file ly mẫu đo ra 90 / 60 / 110, lề 6 và 8, không lỗi, không cảnh báo; `templateFromModel` ra
      230,04 / 327,05 / 0,84894 và 279,67 × 120,85. Các số viết thẳng trong test.
- [ ] Toàn bộ test chép sang xanh mà không đổi số mong đợi nào. Test nào phải đổi thì ghi lý do vào báo cáo.
- [ ] `three/addons/loaders/GLTFLoader.js` chỉ được import động.

### Task B2: Tầng dữ liệu trên mock

**File tạo:** `api.ts`, `schemas.ts`, `types.ts`, `queries.ts`, `mutations.ts`, `lifecycle.ts`, `selectors.ts`,
`index.ts` của feature; route mock trong `src/lib/api/` theo cách chia file hiện có (`mock-routes-*.ts`).

- `PrintConfigDto`: `model`, vùng in, lề, `model3d: { url, surfaces: [{ printAreaCode, meshName }] } | null`,
  `checksum`. Hình dạng theo `2026-11-13-design-yeu-cau-bo-sung-cho-be.md` (mục B-1 đến B-3); chỗ BE chưa chốt
  thì ghi `ASSUMPTION` kèm số mục.
- `getPrintConfig(productId, variantId)`, `savePrintConfig(productId, variantId, { file, config })`: một lần gọi
  gửi cả file lẫn số đo (multipart, như `uploadVariantMedia`). Lưu xong làm mới cấu hình in của biến thể.
- Mock: giữ file trong bộ nhớ, trả lại `url`; biến thể của sản phẩm không tuỳ biến trả 404.

- [ ] Test hợp đồng mock theo kiểu `*.mock-contract.test.ts` của repo; test zod cho DTO và payload lưu.

### Task B3: Màn hình upload và kiểm

**File tạo (`components/`, mỗi file ≤ 150 dòng):** khung chọn file, bảng số đo, danh sách lỗi và cảnh báo, ô số
của nhà sản xuất, mục "Nâng cao" (mép dán, lề, chất liệu), thanh lưu. Lấy nội dung và cách xử lý từ
`components/model-check/*` của storefront, viết lại giao diện theo Mode A.

Luồng:

1. Chọn file `.glb` (đọc tại trình duyệt; trên 50 MB không đọc).
2. Hiện loại sản phẩm và số đo; tách hai nhóm: đọc từ file, và mặc định cần xác nhận.
3. Hiện lỗi và cảnh báo. Có lỗi thì không lưu được.
4. Gõ số của nhà sản xuất (không bắt buộc); lệch quá 1 mm thì cảnh báo, không chặn.
5. Lưu: gửi file và cấu hình sinh từ `templateFromModel`.
6. Sửa số đo sau khi đã có file: chạy `templateDifferences` giữa file và số mới; lệch quá 1 mm thì không lưu,
   yêu cầu tải file mới. Đây là chỗ thay cho bước đối chiếu đã gỡ khỏi storefront.

- [ ] Test trước (RTL, `userEvent`, loader giả và một lần với file mẫu thật): file đúng → bảng số và nút lưu; file
      không có `print:*` → lỗi, không lưu; số nhà sản xuất lệch 2 mm → cảnh báo, vẫn lưu được; túi lệch tâm → lỗi
      nêu số lệch; sửa chiều cao thành 120 khi file vẫn 110 → không lưu; quyền chỉ xem → không có nút.
- [ ] Trạng thái: chưa có cấu hình, đang đọc, lỗi đọc file, đang lưu, lưu lỗi.

### Task B4: Xem thử lưới đánh số (làm sau B3; có thể để đợt sau)

**File tạo:** chép `print-uv.ts`, `engine/surfaces/{cup,rect}.ts` và phần chung của chúng, `grid-texture.ts`; một
viewer bằng `@react-three/fiber` hiện cây đã nạp, thay hình học phần in bằng `printGeometry` và dán lưới.

- [ ] Test: UV của file mẫu tại 6 điểm bằng đúng số của storefront (chép số từ test của storefront).
- [ ] Kiểm trên trình duyệt: số đứng thẳng, ô 3 và 8 ở mặt trước, vạch đường nối ở phía sau.

### Task B5: Gắn vào trang biến thể

**File sửa:** `src/app/admin/variants/[id]/page.tsx` (ghép mục "Cấu hình in"), `ADMIN_ROUTES`/`UI_LABELS` nếu
cần. Việc này đụng tới file của module sản phẩm: cần chủ dự án đồng ý trước khi làm.

- [ ] Mục chỉ hiện với biến thể của sản phẩm `CUSTOMIZABLE`; nút theo quyền quản lý sản phẩm.
- [ ] Phần 3D tải bằng `next/dynamic`, không nằm trong lần tải đầu của trang biến thể.
- [ ] `pnpm run validate`; kiểm trên trình duyệt với file ly mẫu.

---

## Phần 3 — Để sau, cần BE

- BE làm các mục B-1 đến B-3 và yêu cầu "một cặp" ở Task S4; back-office đổi từ mock sang API thật.
- Storefront nối module design với BE thật (đã có trong danh sách việc để sau).
- Nếu sau này hai bản code chép lệch nhau gây lỗi: tách `model3d` thành gói dùng chung. Chưa làm bây giờ vì
  cần thêm hạ tầng phát hành gói cho hai repo.

## Thứ tự

`S1` → `B1` → (`S2`, `S3`, `S4` ở storefront) song song với (`B2` → `B3` → `B5`, rồi `B4`) ở back-office.
Storefront chỉ gỡ sau khi `B1` xanh, để phần đo lúc nào cũng tồn tại ít nhất ở một nơi có test.

## Việc cần chủ dự án quyết trước khi chạy

1. **Task S1:** commit bản đầy đủ trước khi gỡ, hay chỉ xuất bản vá.
2. **Bước đối chiếu:** gỡ hẳn khỏi storefront như plan này, hay giữ một bản mỏng tới khi BE làm xong yêu cầu
   "một cặp".
3. **Task B4:** làm lưới đánh số ở back-office ngay đợt đầu hay để sau. Nếu để sau, trong lúc chờ sẽ không có
   chỗ nào xem lưới trên file Blender.
4. **Task B5:** cho phép sửa trang biến thể của module sản phẩm ở back-office.
