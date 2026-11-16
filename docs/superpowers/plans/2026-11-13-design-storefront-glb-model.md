# Storefront hiện model 3D từ file `.glb`: kế hoạch triển khai

> **Dành cho agent:** BẮT BUỘC dùng superpowers:subagent-driven-development (khuyên dùng) hoặc
> superpowers:executing-plans để làm từng task. Các bước dùng ô `- [ ]` để theo dõi.

**Mục tiêu:** studio hiện model `.glb` thật thay cho mẫu 3D dựng bằng code, hình thiết kế dán lên model đúng
chỗ như bản in; có phần đo và kiểm model, và một trang thử model để kiểm file Blender.

**Kiến trúc:** bộ số đo (`template.model` kiểu ly / túi) vẫn là nền cho mọi thứ 2D. Dữ liệu `.glb` đi bên
cạnh (`model3d`). Một module thuần `engine/model3d/` nạp file, đo, kiểm, **tự tính UV** cho các mesh in bằng
đúng công thức của mẫu hiện tại, rồi trả ra cùng dạng cảnh (`ModelScene`) mà viewer đang dùng. Viewer hiện mẫu
số đo ngay và đổi sang model khi nạp xong; lỗi thì giữ mẫu số đo.

**Công nghệ:** three.js 0.186 (`three/addons/loaders/GLTFLoader.js`, chỉ nạp bằng `import()` động), zod 4,
React 19, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-13-design-storefront-glb-model.md`. Quy ước chung:
`docs/superpowers/specs/2026-11-13-design-print-config-files-2d-3d.md`. Bản đồ code:
`C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\glb\code-map.md`.

## Ràng buộc chung

- Mọi điều trong
  `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\implementer-rules.md`
  (pnpm; không stash / add / commit; không build, không dev server; không formatter cả thư mục; không `any` /
  `@ts-ignore` / `eslint-disable`; không gọi subagent; TDD; chữ tiếng Việt; chỉ token; vùng bấm 44 px).
- Chỉ sửa: `src/features/product-design/**`, `src/app/(studio)/**`, `src/constants/routes.ts`,
  `src/lib/api/mock-fixtures/design-print-configs.ts` và test của nó, `public/models/**`,
  `scripts/make-sample-glb.mjs`. Không sửa file của catalog hay module khác.
- **Phần 2D không đổi:** `createSurfaces`, preflight, file in, `compose` không sửa. Kiểu `model.kind === "gltf"`
  giữ nguyên trạng (vẫn bị từ chối); `.glb` đi qua trường mới `model3d`.
- Số liệu từ spec: đơn vị file là mét, nhân 1000 khi nạp; sai số hình 0,5 mm; lệch số đo so với template tối đa
  1 mm; số cạnh quanh thân ly ≥ 32; file ≤ 10 MB, ≤ 100.000 tam giác; thời gian chờ nạp 15 giây; khoảng hợp lý
  của chiều cao ly 20–400 mm.
- Tên mesh in: `print:BODY`, `print:FRONT`, `print:BACK`, `print:LEFT`, `print:RIGHT`.
- Các test hiện có của viewer, studio và gửi duyệt phải xanh mà không đổi ý nghĩa.

## Trọng tâm review

1. **Model lệch số đo của template quá 1 mm:** không được dán hình lên model lệch; viewer giữ mẫu số đo và báo.
   Test ở Task 4 và Task 5.
2. **Mesh thân ly ít cạnh, có tam giác vắt qua đường nối phía sau, hoặc không có UV:** hình không bị kéo vệt,
   không lỗi. Test ở Task 3.
3. **Đổi bản thiết kế hoặc rời trang khi model đang nạp:** huỷ việc nạp, không gắn model vào viewer đã huỷ,
   không rò bộ nhớ. Test ở Task 5.
4. **File sai đơn vị (dựng bằng mm thay vì mét) hoặc thiếu `print:*`:** trang thử model nói rõ lỗi; trong
   studio thì dùng mẫu số đo. Test ở Task 2 và Task 7.
5. **Gửi duyệt hoặc bấm "Xem 3D" khi model chưa nạp xong hoặc nạp lỗi:** ảnh xem trước vẫn chụp được (chờ tối
   đa 15 giây, rồi dùng mẫu số đo). Test ở Task 6.

---

### Task 1: Dữ liệu `model3d` trong cấu hình in

**File:** tạo `engine/model3d/schema.ts`; sửa `schemas.ts` (`printConfigDtoSchema`), `types.ts`,
`engine/index.ts` (re-export), `src/lib/api/mock-fixtures/design-print-configs.ts` (`PrintConfigRow.model3d`);
test `engine/__tests__/model3d-schema.test.ts`, bổ sung `__tests__/schemas.test.ts`.

**Tạo ra:**

- `model3dRefSchema` và `type Model3dRef = { url: string; surfaces: { printAreaCode: PrintAreaCode; meshName:
string }[] }` (`url` không rỗng; `surfaces` ít nhất 1 dòng, `printAreaCode` không trùng, `meshName` 1–100 ký
  tự).
- `PrintConfig.model3d: Model3dRef | null`: DTO nhận vắng, `null` hoặc hợp lệ, và chuẩn hoá vắng thành `null`.
  `printAreaCode` phải là một vùng in của `template` (kiểm ở mức DTO); sai thì parse lỗi.
- Mock: `PrintConfigRow` có `model3d?: Model3dRef | null`; chưa quy cách nào có giá trị (Task 6 thêm).

- [ ] Test trước: vắng → `null`; `null`; hợp lệ; `printAreaCode` trùng; `printAreaCode` không thuộc template;
      `meshName` rỗng; các fixture cấu hình in hiện có vẫn parse được.
- [ ] Làm cho test xanh; `pnpm run typecheck`.

### Task 2: Đo và kiểm model

**File:** tạo `engine/model3d/measure.ts`, `engine/model3d/issues.ts`; test
`engine/__tests__/model3d-measure.test.ts`.

**Tạo ra:**

- `measureModel(root: Object3D, info?: { byteLength?: number }): ModelMeasurement`, với `root` đã ở đơn vị mm.
  ```ts
  type ModelMeasurement = {
    kind: "cup" | "bag" | null;
    model: CupModel | BagModel | null; // null khi có lỗi chặn
    printMeshes: { printAreaCode: PrintAreaCode; meshName: string }[];
    issues: ModelIssue[];
  };
  type ModelIssue = {
    code: ModelIssueCode;
    level: "error" | "warning";
    message: string;
    meshName?: string;
  };
  ```
- Ly: `topDiameterMm`, `bottomDiameterMm` từ bán kính vòng trên / vòng dưới của `print:BODY`; `heightMm` là chiều
  cao phần in; `rimMm = 0`, `bandTopOffsetMm = 0`, `bandBottomOffsetMm = 0`; `seamMm` và `material` lấy mặc định
  truyền vào (tham số `defaults`).
- Túi: `widthMm` từ `print:FRONT` (hoặc `BACK`), `gussetMm` từ `print:LEFT` / `RIGHT`, `heightMm` là chiều cao mặt;
  `topFoldMm = 0`.
- Mã lỗi (`ModelIssueCode`), mỗi mã một câu tiếng Việt: `NO_PRINT_MESH`, `DUPLICATE_PRINT_MESH`, `MIXED_KINDS`
  (vừa có `BODY` vừa có mặt túi), `BAD_UNITS` (chiều cao ngoài 20–400 mm), `NOT_REVOLVED` (không tròn xoay quanh
  Y, sai số > 0,5 mm), `TOO_COARSE` (< 32 cạnh quanh thân), `NOT_PLANAR`, `NOT_RECTANGULAR`, `TOO_MANY_TRIANGLES`
  (> 100.000), `FILE_TOO_LARGE` (> 10 MB); cảnh báo: `NOT_FACING_FRONT`, `BASE_NOT_AT_ZERO`.
- `compareWithNominal(model, nominal): ModelIssue[]`: cảnh báo `NOMINAL_MISMATCH` cho mỗi số lệch > 1 mm.

- [ ] Test trước (dựng mesh three trong bộ nhớ): ly và túi đúng → số đo đúng đến 0,1 mm; mỗi mã lỗi ở trên có
      một ca; mesh dựng bằng mm đã nhân sai đơn vị → `BAD_UNITS`; `compareWithNominal` lệch 1,5 mm → cảnh báo, lệch
      0,5 mm → không.
- [ ] Làm cho test xanh.

### Task 3: Tính UV cho mesh in và tách đường nối

**File:** tạo `engine/model3d/print-uv.ts`; sửa `engine/viewer3d/cup-mesh.ts` (chỉ `export` hàm
`printedWidthMm`); test `engine/__tests__/model3d-print-uv.test.ts`.

**Tạo ra:**

- `printGeometry(mesh: Mesh, target: { code: PrintAreaCode; surface: PrintSurface }, model: CupModel | BagModel):
BufferGeometry`: trả hình học mới (không chỉ mục), đã có `uv`:
  - Ly (`BODY`): với mỗi điểm, `alpha = atan2(-x, -z)` đưa về [0, 2π) (0 ở −Z, đúng quy ước của `cup-mesh.ts`),
    `t = (yTop − y) / (yTop − yBottom)` theo vòng trên / dưới của chính mesh, `v = vRange[0] + t * (vRange[1] −
vRange[0])`, rồi `surface.uvOf(surface.toFlat((alpha / 2π) * printedWidthMm(model, surface), v))`.
  - Tam giác vắt qua đường nối (các `alpha` chênh nhau > π): cộng 2π cho các điểm phía nhỏ trước khi tính, để cả
    tam giác nằm một phía.
  - Túi: `s` và `t` trong khung chữ nhật của mặt, theo chiều của `bag-mesh.ts` (`FRONT` từ −x sang +x; `RIGHT` từ
    +z sang −z; `BACK` từ +x sang −x; `LEFT` từ −z sang +z; `t` = 0 ở mép trên), rồi cùng công thức `toFlat` →
    `uvOf` của `bag-mesh.ts`.
  - Giữ `position` và `normal`; bỏ `uv` cũ của file.

- [ ] Test trước: với ly `cup12oz`, một mesh thân có số cạnh và số vòng khác mẫu, không có `uv`: UV tại mọi điểm
      trùng giá trị công thức của `cup-mesh.ts` (sai số < 1e-6); mesh có tam giác vắt đường nối: không tam giác nào
      có độ rộng u vượt nửa bề ngang khuôn; `uvToSurfacePoint` đảo ngược UV ra đúng (u, v) của điểm; bốn mặt túi
      `bagM` trùng công thức của `bag-mesh.ts`; mesh có sẵn `uv` sai bị ghi đè.
- [ ] Làm cho test xanh; các test `meshes.test.ts`, `scene-parts.test.ts` vẫn xanh.

### Task 4: Nạp `.glb` và dựng cảnh

**File:** tạo `engine/model3d/load.ts`, `engine/model3d/scene.ts`, `engine/model3d/index.ts`,
`scripts/make-sample-glb.mjs`, `public/models/sample-cup-12oz.glb` (sinh bằng script); sửa `engine/index.ts`;
test `engine/__tests__/model3d-scene.test.ts`.

**Dùng:** `measureModel` (Task 2), `printGeometry` (Task 3), `Model3dRef` (Task 1), `ModelScene` / `PrintMesh`
của `viewer3d/scene-parts.ts`, `createProductMaterials` hiện có.
**Tạo ra:**

- `loadGlb(source: string | ArrayBuffer, opts?: { signal?: AbortSignal }): Promise<Group>`: `import()` động
  `three/addons/loaders/GLTFLoader.js`; URL thì `fetch` (có `signal`) rồi `parse`; nhân tỉ lệ 1000 (mét → mm) và
  áp vào hình học.
- `class Model3dError extends Error { code: "LOAD_FAILED" | "ABORTED" | "MESH_MISSING" | "INVALID_MODEL" |
"MODEL_MISMATCH"; issues?: ModelIssue[] }`.
- `buildGlbScene(root: Group, ref: Model3dRef, model: CupModel | BagModel, surfaces: SurfaceSet): ModelScene`:
  - tìm mesh theo `ref.surfaces[].meshName`; thiếu → `MESH_MISSING`;
  - `measureModel`; có lỗi chặn → `INVALID_MODEL` kèm `issues`;
  - so số đo với `model` của template; lệch > 1 mm ở bất kỳ kích thước nào → `MODEL_MISMATCH`;
  - thay hình học các mesh in bằng `printGeometry`; vật liệu in do bộ `materials` hiện có cấp (theo
    `model.material`); các mesh khác giữ vật liệu của file;
  - trả `{ group, meshes, materials, printMeshes }` như `buildModelScene`.
- `disposeGlbScene(scene)`: giải phóng hình học, vật liệu và ảnh của file.
- `scripts/make-sample-glb.mjs`: JS thuần, không import từ `src`; dựng ly 12oz theo đúng số đo của `CUP12-BODY`
  trong mock (đọc số từ hằng số ghi trong script, có ghi chú nguồn), gồm `print:BODY`, `rim`, `bottom`, `inner`;
  ghi `.glb` bằng tay (đoạn JSON + đoạn BIN); chạy bằng `node scripts/make-sample-glb.mjs`.

- [ ] Test trước: đọc `public/models/sample-cup-12oz.glb` bằng `fs` → `loadGlb(ArrayBuffer)` → `buildGlbScene` với
      `cup12oz`: có đúng một mesh in `BODY`, có `uv`, kích thước mm; `ref` trỏ mesh không có → `MESH_MISSING`;
      template có số đo lệch 2 mm → `MODEL_MISMATCH`; `signal` đã huỷ → `ABORTED`; `fetch` lỗi → `LOAD_FAILED`.
- [ ] Làm cho test xanh; `pnpm exec vitest run src/features/product-design/engine`.

### Task 5: `ProductViewer` nhận `model3d`

**File:** sửa `engine/viewer3d/product-viewer.ts`; test bổ sung `engine/__tests__/product-viewer.test.ts`.

**Tạo ra:**

- `setModel(template, surfaces, model3d?: Model3dRef | null): void`: dựng mẫu số đo như cũ (đồng bộ). Có
  `model3d` thì bắt đầu nạp; nạp xong và dựng cảnh được thì **thay nhóm mesh** (cùng đường đi của `setModel`: gắn
  lại các ảnh đang giữ, khung hình theo hộp bao của model, bóng đổ, đồng bộ ánh sáng, `invalidate`).
- Sự kiện mới: `on("model3d", cb: (state: { status: "loading" | "ready" | "failed"; code?: Model3dError["code"] })
=> void)`.
- `whenModelReady(): Promise<void>`: xong khi model đã thay hoặc đã thất bại; không có `model3d` thì xong ngay.
- `ViewerOptions.loadModel3d?: typeof loadGlb` (chỗ cắm cho test).
- `setModel` lần nữa hoặc `dispose` khi đang nạp: huỷ (`AbortController`); kết quả đến muộn bị bỏ và được giải
  phóng. `clearModel` giải phóng tài nguyên của file `.glb`.
- `pick` và `focusSurface` chạy trên model mới (mesh in có `uv`, nằm trong `modelMeshes`).

- [ ] Test trước: có `model3d` → ngay sau `setModel` vẫn là mẫu số đo, sự kiện `loading`; khi loader giả trả cảnh
      → nhóm mesh được thay, ảnh đã `setSurfaceTexture` trước đó vẫn gắn trên mesh in mới, sự kiện `ready`,
      `whenModelReady` xong; loader giả lỗi / `MODEL_MISMATCH` → giữ mẫu số đo, sự kiện `failed` kèm mã; `dispose`
      khi đang nạp → loader nhận `signal` đã huỷ, cảnh đến muộn không được gắn và được giải phóng; `setModel` hai
      lần liên tiếp → chỉ lần sau có hiệu lực; `pick` trên mesh in của model trả đúng vùng in.
- [ ] Làm cho test xanh; toàn bộ `product-viewer.test.ts` cũ vẫn xanh.

### Task 6: Studio, ảnh xem trước, "Xem 3D", quy cách mẫu

**File:** sửa `components/studio/viewer-3d.tsx`, `viewer-host.tsx` (dòng trạng thái),
`components/studio/preview-export.ts`, `load-design-session.ts` (nếu cần), mock `design-print-configs.ts` (một
quy cách mẫu có `model3d`); test bổ sung `__tests__/studio-viewer.test.tsx` (cập nhật `FakeViewer`),
`__tests__/preview-export.test.ts` (hoặc file test hiện có của preview), test của mock.

**Dùng:** API viewer của Task 5; `within` trong `components/studio/deadline.ts`.
**Tạo ra:**

- `Viewer3D` truyền `services.printConfig.model3d` vào `setModel`; nghe sự kiện `model3d`: đang nạp → dòng nhỏ
  "Đang tải mô hình 3D…" (`role="status"`); thất bại → "Không tải được mô hình 3D, đang dùng mẫu thay thế";
  sẵn sàng → không hiện gì.
- `exportPreview`: trước khi chụp, chờ `viewer.whenModelReady()` tối đa 15 giây (cả viewer trên màn hình lẫn
  viewer ngoài màn hình); quá hạn thì chụp bằng thứ đang có.
- Mock: quy cách `CUP12-BODY` (ly 12oz trắng) có `model3d: { url: "/models/sample-cup-12oz.glb", surfaces: [{
printAreaCode: "BODY", meshName: "print:BODY" }] }`. Các test hiện có dùng quy cách này phải vẫn xanh (trong
  jsdom viewer là `FakeViewer` hoặc không có WebGL).

- [ ] Test trước: studio mở bản của quy cách có `model3d` → `setModel` được gọi với `model3d`; sự kiện `loading`
      hiện dòng "Đang tải mô hình 3D…", `failed` hiện dòng báo lỗi, `ready` xoá dòng; quy cách không có `model3d` →
      không dòng nào, `setModel` nhận `null`; `exportPreview` chờ `whenModelReady` rồi mới `screenshot`; khi
      `whenModelReady` treo, sau 15 giây (đồng hồ giả) vẫn chụp; các test gửi duyệt hiện có vẫn xanh.
- [ ] Làm cho test xanh; `pnpm exec vitest run src/features/product-design src/lib/api`.

### Task 7: Trang thử model

**File:** tạo `src/app/(studio)/design/model-check/page.tsx`, `components/model-check/model-check-screen.tsx`,
`model-check-report.tsx`, `model-check-viewer.tsx`, `grid-texture.ts`; sửa `src/constants/routes.ts`
(`STORE_ROUTES.design.modelCheck`); test `__tests__/model-check-screen.test.tsx`.

**Dùng:** `loadGlb`, `measureModel`, `compareWithNominal`, `buildGlbScene`, `ProductViewer`, `createSurfaces`.
**Tạo ra:**

- Trang `/design/model-check`, chỉ hiện khi module design chạy mock (cùng điều kiện với `MockReviewPanel`);
  ngoài mock thì trả trang "không tìm thấy".
- Chọn hoặc kéo thả một file `.glb` (đọc bằng `FileReader` / `arrayBuffer`, không gửi đi đâu) → hiện:
  - loại sản phẩm nhận ra và bảng **số đo đọc được** (mm, một chữ số thập phân);
  - danh sách lỗi và cảnh báo (mỗi dòng: mức, câu tiếng Việt, tên mesh);
  - các ô nhập số danh nghĩa (không bắt buộc) → cảnh báo lệch > 1 mm;
  - khi không có lỗi chặn: model xoay được với **ô lưới đánh số** dán lên từng vùng in (`grid-texture.ts` vẽ lưới
    theo mm trên canvas cỡ khung tràn lề của mặt in), và khuôn 2D tính ra bên cạnh (kèm kích thước mm);
  - đoạn JSON `model` + `model3d` để dán vào `design-print-configs.ts`, có nút "Sao chép".
- Có trạng thái: chưa chọn file, đang đọc, lỗi đọc file (không phải `.glb`).

- [ ] Test trước (loader giả trả cảnh dựng trong bộ nhớ): chọn file đúng → bảng số đo và JSON đúng; file thiếu
      `print:*` → lỗi `NO_PRINT_MESH` bằng tiếng Việt, không có viewer; nhập số danh nghĩa lệch 2 mm → cảnh báo; không
      chạy mock → trang không hiện; file không phải `.glb` → thông báo lỗi đọc file.
- [ ] Làm cho test xanh.

### Sau các task (controller)

1. Review toàn bộ, rồi sửa một đợt.
2. `pnpm run validate`.
3. Kiểm tra trên trình duyệt (1440 px): mở bản của quy cách mẫu → model `.glb` hiện, logo và chữ đúng chỗ so với
   khuôn 2D, chữ uốn đúng, bấm chọn trên 3D, đổi chỗ 2D/3D, gửi duyệt có ảnh xem trước; quy cách không có `.glb`
   vẫn như cũ; trang thử model với file mẫu và với một file cố ý sai.
4. Cập nhật file quy ước chung nếu chiều / tên có gì khác khi chạy thật.

**Thứ tự:** Task 1, 2, 3 chạy song song (file tách rời). Rồi 4 → 5 → 6. Task 7 chạy song song với 5 và 6 sau khi
Task 4 xong.

## Ghi chú

- File `public/models/sample-cup-12oz.glb` chỉ là mẫu kỹ thuật (hình như mẫu dựng bằng code). Khi có model
  Blender thật: kiểm bằng trang thử model, chép vào `public/models/`, dán đoạn JSON vào mock.
- Mặt hông túi trong mẫu số đo có nếp gấp lõm; với `.glb`, mặt hông phải là hình chữ nhật phẳng (spec §5).
