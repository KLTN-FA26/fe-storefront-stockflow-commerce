# Studio — gói nâng cấp kiểu Canva: kế hoạch triển khai

> **Dành cho agent:** BẮT BUỘC dùng superpowers:subagent-driven-development (khuyên dùng) hoặc
> superpowers:executing-plans để làm từng task. Các bước dùng ô `- [ ]` để theo dõi.

**Mục tiêu:** studio có thêm 9 tính năng kiểu Canva (tổ hợp phông, cỡ −/+, viết hoa, căn 6 hướng, bắt
dính vào phần tử khác, sao chép / cắt / dán, menu chuột phải, màu trong thiết kế, chọn nhiều), in ra
đúng như trên màn hình.

**Kiến trúc:** quy tắc thuần (chọn nhiều, khung bao, căn, bắt dính, dán, chép kiểu, gom màu) nằm trong
`engine/` hoặc file `*-actions.ts` thuần, có unit test; phần giao diện trong `components/studio/` gọi
các hàm đó qua lệnh `editor.apply` (tự lưu, hoàn tác như cũ). Chọn nhiều thêm `selectedIds` vào trạng
thái trình chỉnh sửa và giữ `selectedId` (phần tử chọn gần nhất) để mã hiện có không phải đổi.

**Công nghệ:** React 19, zustand (store của editor), Radix qua gói `radix-ui`, shadcn, Tailwind v4
token, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-12-design-studio-canva-pack.md`. Bản đồ code hiện có:
`C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\part-e\code-map.md`
(mục 4–5).

## Ràng buộc chung

- Mọi điều trong
  `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\deferred\constraints.md`
  (pnpm; không stash / add / commit; không formatter cả thư mục; không `any` / `@ts-ignore` /
  `eslint-disable`; không gọi subagent; TDD; chữ tiếng Việt; chỉ token; vùng bấm 44 px; focus-visible).
- Chỉ sửa `src/features/product-design/**`, cộng **một** file mới `src/components/ui/context-menu.tsx`
  sinh bằng `pnpm dlx shadcn@latest add context-menu` (không chỉnh tay; nếu CLI đòi cài thêm gói thì
  dừng lại báo, vì `radix-ui` đã có sẵn).
- Giữ 8 phông hiện có. Mọi thao tác mới là **một bước hoàn tác** (dùng chung `gestureId` khi một thao
  tác gồm nhiều lệnh). Bản chỉ xem không có thao tác sửa mới nào.
- Số liệu từ spec: bước cỡ chữ 1 pt; danh sách cỡ 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48,
  56, 64, 72, 96; dán cùng mặt lệch 5 mm; ngưỡng bắt dính giữ 2 mm; tối đa 12 màu trong thiết kế; mặt
  in tối đa 200 phần tử (`MAX_ELEMENTS_PER_SURFACE`).

## Trọng tâm review

1. **Chọn nhiều rồi đổi mặt in, hoàn tác hoặc xoá:** không còn id "ma" trong `selectedIds` (phần tử đã
   mất hoặc ở mặt khác), thanh ngữ cảnh không lỗi. Test ở Task 1.
2. **Chữ viết hoa trên ly hình quạt và trong file in:** khung chữ được đo theo chữ hoa (không tràn),
   preflight và PDF in dùng chữ hoa; tài liệu cũ không có `uppercase` vẫn mở được. Test ở Task 8.
3. **Phím tắt khi đang gõ chữ:** Ctrl+C / V / X / A trong ô sửa chữ, ô số hoặc ô tìm phông vẫn là của
   ô đó, không sao chép / dán phần tử. Test ở Task 5.
4. **Dán khi clipboard hệ thống có ảnh** sau khi đã Ctrl+C một phần tử: ảnh được ưu tiên như spec; dán
   khi mặt đã đủ 200 phần tử thì báo lý do. Test ở Task 5.
5. **Kéo nhóm có phần tử bị khoá:** phần tử khoá đứng yên, các phần tử khác di chuyển, một bước hoàn
   tác. Test ở Task 2.

---

### Task 1: Mô hình chọn nhiều và lệnh cho nhóm (engine)

**File:** sửa `engine/editor/controller.ts` (trạng thái và API chọn), `engine/editor/shortcuts.ts`
(Ctrl+A); sửa `components/studio/element-actions.ts` (các lệnh cho nhóm); test
`engine/__tests__/editor.test.ts` (hoặc file test controller hiện có),
`__tests__/element-actions.test.ts`.

**Tạo ra:**
- `EditorState.selectedIds: readonly string[]` (thứ tự chọn); `selectedId` = phần tử cuối của
  `selectedIds` hoặc `null`.
- API mới của `EditorController`:
  - `select(id)` giữ nguyên nghĩa: chọn một, xoá phần còn lại;
  - `toggleSelect(id: string): void`;
  - `selectMany(ids: readonly string[]): void`;
  - `selectAll(): void` (bỏ qua phần tử khoá và ẩn).
- `selectedIds` luôn chỉ chứa id có trên mặt đang mở; đổi mặt, hoàn tác, xoá hay thay tài liệu thì lọc
  lại (Trọng tâm review 1).
- `resolveShortcut` thêm `{ action: "selectAll" }` cho Ctrl/⌘+A.
- Lệnh nhóm trong `element-actions.ts` (thuần, một `gestureId`):
  - `currentSelections(services): Target[]`;
  - `nudgeSelection`, `removeSelection`, `duplicateSelection`, `restackSelection` áp cho cả nhóm,
    giữ chữ ký hiện có;
  - phần tử khoá bị bỏ qua khi dịch và xoá.

- [ ] Test trước:
  - toggle thêm / bớt;
  - `selectAll` bỏ qua khoá và ẩn;
  - đổi mặt thì xoá chọn;
  - hoàn tác việc thêm phần tử thì id biến khỏi `selectedIds`;
  - xoá nhóm và nhân bản nhóm là một bước hoàn tác;
  - nhân bản nhóm chọn các bản sao;
  - đổi lớp nhóm giữ thứ tự tương đối;
  - Ctrl+A ra `selectAll`.
- [ ] Làm cho test xanh; `pnpm exec vitest run src/features/product-design/engine` cùng các test
  `element-actions`.

### Task 2: Chọn nhiều trên khung vẽ và trong bảng Lớp

**File:** sửa `components/studio/use-stage-pointer.ts`, `stage-gesture.ts`, `interaction-overlay.tsx`,
`selection-frame.ts`, `layers-panel.tsx`, `use-studio-shortcuts.ts`; test
`__tests__/studio-multi-select.test.tsx`.

**Dùng:** API của Task 1.
**Tạo ra:**
- Shift + bấm lên phần tử gọi `toggleSelect`.
- Kéo từ chỗ trống bằng công cụ Chọn vẽ khung chọn, và chọn các phần tử chạm khung (bỏ qua khoá và
  ẩn).
- Mỗi phần tử trong nhóm có khung mảnh; cả nhóm có một khung bao nét đứt. Tay nắm co giãn và xoay chỉ
  hiện khi chọn đúng một phần tử.
- Kéo một phần tử trong nhóm thì di chuyển cả nhóm, một `gestureId`; phần tử khoá đứng yên.
- Bảng Lớp: Shift hoặc Ctrl + bấm thêm / bớt.
- Ctrl+A nối vào `selectAll`.

- [ ] Test trước:
  - Shift+bấm hai phần tử thì cả hai được chọn;
  - kéo khung chọn đúng phần tử, bỏ qua khoá;
  - kéo nhóm thì mọi phần tử không khoá dịch cùng một khoảng, một lần hoàn tác trả lại hết (Trọng tâm
    review 5);
  - chọn nhiều thì không có tay nắm co giãn;
  - Shift+bấm trong bảng Lớp;
  - Ctrl+A.
- [ ] Làm cho test xanh.

### Task 3: Khung bao, căn 6 hướng, thanh "N phần tử"

**File:** tạo `engine/geometry/bounds.ts` (re-export ở `engine/index.ts`) và
`components/studio/align-actions.ts`; sửa `transform-fields.tsx` (6 nút căn trong "Vị trí", thay 2
nút căn giữa), `context-bar.tsx` (thanh nhiều phần tử); tạo `components/studio/multi-bar.tsx`; test
`engine/__tests__/bounds.test.ts`, `__tests__/align-actions.test.ts`, `__tests__/multi-bar.test.tsx`.

**Tạo ra:**
- `elementSurfaceBounds(el: DesignElement, surface: PrintSurface, sizer: ElementSizer): { uMin; uMax;
  vMin; vMax }`: khung bao thẳng trục trên mặt in, có tính xoay. Chữ hoặc ảnh uốn trên ly tính theo cung
  (`arcOffsetU`).
- `alignTargets(services, edge: AlignEdge): boolean`, với `AlignEdge = "left" | "centerU" | "right" |
  "top" | "centerV" | "bottom"`:
  - một phần tử thì căn theo `safeBox(surface)`;
  - từ 2 phần tử thì căn theo hợp các khung bao của nhóm;
  - phần tử khoá đứng yên; một bước hoàn tác.
- `MultiBar`: "N phần tử" kèm Căn (6 nút trong một popover), Nhân bản, Xoá, Khoá / Mở khoá, Độ mờ
  chung, Lên / Xuống lớp. `ContextBar` hiện `MultiBar` khi `selectedIds.length > 1`.

- [ ] Test trước:
  - khung bao của chữ xoay 90° (đổi rộng và cao);
  - khung bao của chữ uốn trên `cupBody`;
  - căn trái một phần tử theo vùng an toàn trên mặt túi và trên ly;
  - căn trái ba phần tử về mép trái của nhóm;
  - phần tử khoá không đổi vị trí;
  - `MultiBar` hiện đúng số và các nút gọi đúng lệnh.
- [ ] Làm cho test xanh.

### Task 4: Bắt dính vào phần tử khác

**File:** sửa `engine/editor/snap.ts`, `components/studio/stage-gesture.ts`, `selection-frame.ts`
(vẽ đường gióng); test `engine/__tests__/snap.test.ts`, test gesture hiện có.

**Dùng:** `elementSurfaceBounds` (Task 3).
**Tạo ra:**
- `elementSnapTargets(elements, surface, sizer, exclude: ReadonlySet<string>): SnapTarget[]`: mép
  trái, tâm và mép phải theo `u`; mép trên, giữa và dưới theo `v` của các phần tử không ẩn.
- `snapBox(box, targets, thresholdMm): { du; dv; guides }`: dính mép hoặc tâm của khung đang kéo (một
  phần tử hoặc khung bao nhóm) vào mục tiêu gần nhất trong ngưỡng, từng trục riêng.
- Kéo bằng chuột dùng mục tiêu của mặt in hiện có cộng mục tiêu của các phần tử khác; giữ **Alt** thì
  không dính.

- [ ] Test trước:
  - mép trái dính vào mép phải của phần tử khác trong 2 mm, không dính ở 2,5 mm;
  - tâm dính tâm;
  - phần tử ẩn bị bỏ qua;
  - nhóm dính theo khung bao;
  - Alt thì không dính;
  - đường gióng trả về đúng trục.
- [ ] Làm cho test xanh.

### Task 5: Sao chép / cắt / dán / dán kiểu

**File:** tạo `components/studio/clipboard-actions.ts` (thuần) và
`components/studio/use-studio-clipboard.ts`; sửa `engine/editor/shortcuts.ts` (`copy`, `cut`,
`paste`, `copyStyle`, `pasteStyle`), `use-studio-shortcuts.ts`, `use-paste-image.ts` (ưu tiên ảnh
hệ thống); test `__tests__/clipboard-actions.test.ts`, `__tests__/studio-clipboard.test.tsx`.

**Dùng:** lệnh nhóm của Task 1.
**Tạo ra:**
- `copyElements(document, code, ids): ClipboardContent`, với `ClipboardContent = { from:
  PrintAreaCode; elements: DesignElement[] }`.
- `pasteElements(document, code, surface, content, newId): { document; ids } | { refused: "full" }`:
  - dán vào cùng mặt thì lệch 5 mm;
  - mặt khác giữ vị trí và kẹp bằng `clampPlacement`;
  - dán sang mặt `rect` thì bỏ `wrap`.
- `copyStyle(el): StyleContent` và `pasteStyle(el, style): Partial<DesignElement>`:
  - chữ sang chữ chép phông, cỡ, màu, đậm, nghiêng, viết hoa, căn, viền, giãn chữ, giãn dòng, độ mờ;
  - khác loại chỉ chép độ mờ.
- Bộ nhớ sao chép nằm trong một store cục bộ của studio (zustand hoặc ref trong `StudioServices`),
  không lưu xuống đĩa.
- Phím tắt:
  - Ctrl/⌘+C, X, V;
  - Ctrl/⌘+Alt+C và Ctrl/⌘+Alt+V;
  - không chạy khi tiêu điểm nằm trong ô nhập (theo cách `use-studio-shortcuts.ts` đang phân biệt).
- Dán: nếu sự kiện `paste` có file ảnh thì dán ảnh như hiện nay; không có thì dán phần tử.

- [ ] Test trước:
  - dán cùng mặt lệch 5 mm và được id mới;
  - dán sang mặt khác giữ vị trí;
  - chữ uốn dán sang mặt túi thì bỏ uốn;
  - mặt đã đủ 200 phần tử thì `refused` và báo lý do;
  - cắt là một bước hoàn tác;
  - dán kiểu chữ sang chữ;
  - dán kiểu sang ảnh chỉ đổi độ mờ;
  - phím Ctrl+C trong ô sửa chữ không chép phần tử (Trọng tâm review 3);
  - sự kiện paste có ảnh thì dán ảnh (Trọng tâm review 4);
  - bản chỉ xem không dán.
- [ ] Làm cho test xanh.

### Task 6: Menu chuột phải

**File:** thêm `src/components/ui/context-menu.tsx` (shadcn CLI, không chỉnh); tạo
`components/studio/stage-context-menu.tsx`; sửa `canvas-stage.tsx` hoặc `interaction-overlay.tsx`
(bọc vùng vẽ, chọn phần tử dưới chuột khi bấm phải); test `__tests__/stage-context-menu.test.tsx`.

**Dùng:** lệnh của Task 1, 3 và 5.
**Tạo ra:** menu theo spec §2.7.
- Mục và phím tắt hiển thị bên phải:
  - Sao chép, Cắt, Dán, Nhân bản, Xoá;
  - Lên một lớp, Xuống một lớp, Lên trên cùng, Xuống dưới cùng;
  - Khoá / Mở khoá;
  - Sao chép kiểu, Dán kiểu;
  - Chọn tất cả.
- Mục không dùng được thì `disabled`.
- Bấm phải lên chỗ trống thì menu chỉ có Dán và Chọn tất cả.
- Shift+F10 hoặc phím ContextMenu mở menu tại khung của phần tử đang chọn.
- Bản chỉ xem không có menu.
- "Lên trên cùng / Xuống dưới cùng" là hàm mới `restackSelectionToEdge(services, edge: "top" |
  "bottom")` trong `element-actions.ts`.

- [ ] Test trước:
  - bấm phải lên phần tử chưa chọn thì nó được chọn và menu mở;
  - bấm phải lên chỗ trống chỉ có Dán và Chọn tất cả;
  - Dán bị mờ khi chưa sao chép;
  - Xoá bị mờ với phần tử khoá;
  - mỗi mục gọi đúng lệnh;
  - Shift+F10 mở menu;
  - bản chỉ xem không mở.
- [ ] Làm cho test xanh.

### Task 7: Tổ hợp phông và cỡ chữ −/+

**File:** sửa `components/studio/text-actions.ts` (`TEXT_PRESETS`, `TextPreset`), `text-tool-panel.tsx`,
`text-bar.tsx`; tạo `components/studio/font-size-field.tsx`; test `__tests__/text-tool.test.tsx` (bổ
sung), `__tests__/font-size-field.test.tsx`.

**Tạo ra:**
- `TextPreset = { label; fontCode; sizePt; bold; italic; uppercase?; letterSpacingEm? }`, với 8 tổ
  hợp đúng bảng §2.1 của spec.
- `placeText(services, preset)` dùng `preset.fontCode` nếu khuôn cho phép.
- `TextToolPanel` chỉ hiện tổ hợp có phông nằm trong `allowedFonts(template, fonts)`, mỗi tổ hợp vẽ
  bằng đúng phông của nó.
- `FontSizeField({ value, onChange, disabled })`: nút −/+ bước 1 pt, ô số như cũ, và danh sách cỡ
  theo Ràng buộc chung. Giới hạn lấy từ schema hiện có. Dùng trong `TextBar` thay ô cỡ hiện tại; mỗi
  lần đổi là một bước hoàn tác.

- [ ] Test trước:
  - bấm "Bảng hiệu" thì đặt chữ Oswald 48 pt, viết hoa, giãn 0,05 em (cờ viết hoa chỉ thành công
    khi Task 8 xong, nên trước đó test chỉ kiểm phông, cỡ và giãn chữ);
  - khuôn chỉ cho Be Vietnam Pro thì chỉ còn tổ hợp dùng phông đó;
  - −/+ dừng ở giới hạn;
  - chọn 72 từ danh sách;
  - ba lần bấm + là ba bước hoàn tác.
- [ ] Làm cho test xanh.

### Task 8: Viết hoa (Aa)

**File:** sửa `engine/document/schema.ts` (`uppercase` không bắt buộc trên phần tử chữ),
`engine/render/text-layout.ts` (đổi chữ hoa trước khi đo và vẽ, dòng 71 là nơi duy nhất đọc
`content` để vẽ), `components/studio/text-bar.tsx` (nút "Viết hoa" trong nhóm Đậm / Nghiêng),
`text-edit-overlay.tsx` (ô sửa hiện chữ hoa bằng CSS `uppercase`), `text-actions.ts` (tổ hợp "Bảng
hiệu" bật viết hoa); test `engine/__tests__/text-layout.test.ts`, `engine/__tests__/document.test.ts`,
`__tests__/text-tool.test.tsx`.

**Tạo ra:**
- `displayContent(el: TextElement): string`, trả `el.uppercase ? el.content.toLocaleUpperCase("vi") :
  el.content`. `layoutText` dùng hàm này; mọi nơi đo hoặc vẽ chữ (khung vẽ, chữ uốn, file in, 3D, kích
  thước, preflight) đi qua `layoutText`.

- [ ] Test trước:
  - "đường phố" ra "ĐƯỜNG PHỐ";
  - khung chữ viết hoa rộng hơn chữ thường với `fakeMeasure`;
  - tài liệu không có `uppercase` parse được, và lưu lại không thêm trường;
  - nội dung lưu không đổi khi bật viết hoa;
  - chữ uốn trên `cupBody` đo theo chữ hoa (Trọng tâm review 2);
  - nút trên thanh bật / tắt là một bước hoàn tác.
- [ ] Làm cho test xanh.

### Task 9: Màu trong thiết kế

**File:** tạo `components/studio/document-colors.ts` (thuần); sửa `color-field.tsx` (nhóm "Màu trong
thiết kế" phía trên "Màu gần đây"); test `__tests__/document-colors.test.ts`,
`__tests__/color-field.test.tsx` (bổ sung).

**Tạo ra:**
- `documentColors(document: DesignDocument, limit = 12): Hex[]`: gom màu chữ, màu viền, nền màu, hai
  màu của nền hoa văn và màu nét vẽ ở mọi mặt; bỏ trùng (không phân biệt hoa thường); sắp theo số lần
  dùng giảm dần, bằng nhau thì theo thứ tự xuất hiện.
- `ColorField` đọc tài liệu qua `useEditorState` (chỉ trong studio) và hiện nhóm màu đó.

- [ ] Test trước:
  - gom đủ năm nguồn màu;
  - bỏ trùng `#ff0000` và `#FF0000`;
  - sắp theo số lần dùng;
  - cắt ở 12;
  - bấm một ô đặt màu đó.
- [ ] Làm cho test xanh.

### Sau các task (controller)

1. Review toàn bộ gói, rồi sửa một đợt.
2. Chạy `pnpm run validate` (dừng server dev trước khi build).
3. Kiểm tra trên trình duyệt ở 1440 px và 1024 px:
   - tổ hợp phông;
   - cỡ −/+;
   - viết hoa trên ly và túi, rồi xem file in;
   - căn 6 hướng với một và nhiều phần tử;
   - bắt dính;
   - Ctrl+C / V / X / D;
   - menu chuột phải;
   - màu trong thiết kế;
   - chọn nhiều bằng chuột, bằng khung kéo, bằng Ctrl+A và trong bảng Lớp.

**Thứ tự:**
- Tuần tự 1 → 2 → 3 → 4 → 5 → 6. Các task này cùng sửa `shortcuts.ts`, `use-studio-shortcuts.ts` và
  các file vùng vẽ, nên không chạy song song.
- Task 7 rồi Task 8 chạy song song với chuỗi trên (cùng sửa `text-bar.tsx` và `text-actions.ts`, nên
  8 sau 7).
- Task 9 chạy song song bất kỳ lúc nào.
