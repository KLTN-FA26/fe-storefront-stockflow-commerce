# Module 12 phần E — dự án thiết kế: kế hoạch triển khai

> **Dành cho agent:** BẮT BUỘC dùng superpowers:subagent-driven-development (khuyên dùng) hoặc
> superpowers:executing-plans để làm từng task. Các bước dùng ô `- [ ]` để theo dõi.

**Mục tiêu:** khách gom các bản thiết kế vào dự án, dùng chung thư viện ảnh và mẫu chữ, nhân bản
một bản sang variant khác của cùng product, xem các bản cạnh nhau và gửi duyệt cả bộ (tất cả hoặc
không); phía người duyệt được giả lập.

**Kiến trúc:** mọi thứ nằm trong `src/features/product-design` (mảng con "project"), mock nằm
trong `src/lib/api/mock-fixtures/design-store-*.ts` như phần A. Bố cục mới khi nhân bản do một hàm
thuần trong engine tính. Gửi cả bộ dùng một "bộ chạy" tách khỏi studio, tự tải một bản (tài liệu,
khuôn, phông, ảnh) để kiểm tra và dựng file; nút "Gửi duyệt" của studio dùng lại bộ chạy đó.

**Công nghệ:** Next.js App Router, React 19, TanStack Query 5, zod 4, nuqs, react-hook-form,
Tailwind v4 token, shadcn/Radix, Vitest + RTL, mock lưu IndexedDB.

**Spec:** `docs/superpowers/specs/2026-11-12-design-module12-e-projects-design.md`. Bản đồ code
hiện có (đường dẫn, tên hàm, chữ ký):
`C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\part-e\code-map.md`.

## Ràng buộc chung

- Mọi điều trong
  `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\deferred\constraints.md`:
  chỉ `pnpm`; không `git stash` / `git add` / commit; không chạy formatter cả thư mục; không `any` /
  `@ts-ignore` / `eslint-disable`; không gọi subagent; TDD; chữ trên giao diện tiếng Việt; chỉ dùng
  token; vùng bấm 44 px; focus-visible rõ.
- Chỉ sửa `src/features/product-design/**`, `src/app/(storefront)/design/**`,
  `src/app/(studio)/**`, `src/lib/api/mock-adapter.ts`, `src/lib/api/mock-design*.ts`,
  `src/lib/api/mock-fixtures/design-*.ts`, và thêm route vào `src/lib/constants/routes.ts`
  (`STORE_ROUTES.design`). Không sửa file của catalog hay module khác (kể cả `src/lib/mock-data.ts`)
  trừ khi người dùng cho phép (xem "Việc còn chờ người dùng").
- Giới hạn từ spec: tên dự án ≤ 200 ký tự, mô tả ≤ 2.000; tối đa **20 bản** mỗi dự án (không tính
  ARCHIVED); thư viện tối đa **30 ảnh** và **30 mẫu chữ** (A-E1); gửi cả bộ cần **≥ 2 bản DRAFT**.
- Mỗi quy tắc BR-xx trong zod hoặc bảng vòng đời ghi chú nguồn docs; giả định ghi `ASSUMPTION
  (A-E1…A-E4)`.
- Tên thật trong code (spec viết khác): `CustomizationTemplate` (không phải `Template`),
  `createSurfaces(template): SurfaceSet` (không phải `buildSurfaces`), `ASSET_DRAG_TYPE` ở
  `components/studio/asset-drag.ts`.

## Quyết định khi lập kế hoạch (khác hoặc bổ sung so với spec)

- **Q1 — Màn hình gửi cả bộ là một trang trong nhóm `(studio)`**:
  `/design/projects/[id]/submit?ids=…`, không phải hộp thoại trên trang dự án. Lý do: phông chữ
  (`STUDIO_FONTS`, next/font) chỉ được nạp ở nhóm studio, mà kiểm tra và dựng file in cần phông thật.
  Trang này chỉ mở trên máy tính (`DesktopOnlyGate`), đúng như studio, nơi các bản nháp được làm ra.
- **Q2 — Trên trang dự án, tab Chữ của thư viện** hiện nội dung bằng phông mặc định, kèm "Phông ·
  cỡ · ô màu". Lý do: trang storefront không nạp 8 họ phông. Trong studio, mẫu chữ hiện đúng phông.
- **Q3 — Thẻ bản trong dự án dùng nút bấm ngay trên thẻ**, như `design-card.tsx` hiện nay, không
  thêm primitive menu mới.
- **Q4 — Công thức nhân bản** (thoả §7 của spec cho cả hai loại mặt in): vị trí `u, v` đổi theo tỉ
  lệ trong `uRange` / `vRange` của mặt gốc sang mặt đích; `placement.scale` nhân với `s = min(độ
  dài u đích / gốc, độ dài v đích / gốc)`. Với ly hình quạt, `u` là độ dài cung ở bán kính giữa,
  nên tỉ lệ `u` chính là tỉ lệ góc; `s` thường là tỉ lệ chiều cao dải in. Cỡ chữ và nét vẽ tự co
  theo `scale`, không đổi `sizePt` hay điểm nét. Rẽ nhánh theo `surface.kind`, không theo loại
  model (ly gần thẳng là `rect`).
- **Q5 — Mock**: mở rộng `DESIGN_PATH` cho `/design-projects…`; dữ liệu IndexedDB cũ (chưa có
  collection mới) được bù mặc định khi nạp; giả lập thêm công tắc "lần duyệt kế tiếp sẽ lỗi" cho
  bản được chọn; `MockReviewPanel` gắn thêm ở các trang dự án.
- **Q6 — Ràng buộc file của thư viện** dùng `DEFAULT_FILE_RULES` của mock (PNG, JPEG, 50 MB). SVG
  được trình duyệt đổi sang PNG trước khi tải lên, như ảnh của bản; PDF chưa được xử lý ở đâu nên
  ngoài phạm vi.

## Trọng tâm review

1. **Dữ liệu IndexedDB lưu trước phần E** (không có dự án, thư viện, lượt duyệt): mock nạp lên không
   lỗi, các trang dự án hiện rỗng. Test ở Task 1.
2. **Bản đang mở ở tab khác** khi nó bị thêm hay gỡ khỏi dự án, hoặc dự án bị đóng: header studio đi
   theo sau lần tải lại, không ghi đè dữ liệu; lệnh có `version` cũ bị từ chối 409. Test ở Task 2 và
   Task 8.
3. **Gửi cả bộ bị ngắt giữa chừng** (đóng tab, mất mạng): không có lượt duyệt dở; tải lại cùng file
   không tạo bản trùng; không bản nào đổi trạng thái. Test ở Task 10.
4. **Nhân bản một bản có phần tử sát mép hoặc chữ uốn theo ly** sang cỡ khác: phần tử nằm trong
   vùng in (bị kẹp vào nếu tràn), chữ uốn vẫn uốn; phần tử tràn vùng an toàn thì preflight của bản
   mới báo. Test ở Task 4.
5. **Biên giới hạn**: bản thứ 20, mục thư viện thứ 30, chọn 1 bản để gửi cả bộ — các nút bị khoá và
   nêu lý do, máy chủ trả đúng mã lỗi. Test ở Task 1, Task 3, Task 7 và Task 10.

---

### Task 1: Mock — dự án, thành viên, đóng dự án, lịch sử

**File:** tạo `src/lib/api/mock-fixtures/design-store-projects.ts`; sửa `design-store.ts`,
`design-store-context.ts`, `design-store-access.ts` (`isState` và nạp dữ liệu cũ), `design-rows.ts`
(sự kiện mới, hàng dự án), `design-store-designs.ts` (`create` nhận `projectId`; DTO có
`project`), `src/lib/api/mock-design.ts` (route), `src/lib/api/mock-adapter.ts` (`DESIGN_PATH`,
`hasDesignRoutes`); test `design-store-projects.test.ts`, `design-storage.test.ts`.

**Tạo ra (API mock, như spec §4):** `GET/POST /design-projects`, `GET/PATCH /design-projects/{id}`,
`POST /design-projects/{id}/archive`, `GET/POST /design-projects/{id}/designs`,
`DELETE /design-projects/{id}/designs/{designId}`, `GET /design-projects/{id}/history`; `POST
/designs` nhận `projectId`. DTO bản thiết kế có thêm `project: { id, name, status } | null`. Sự
kiện bản: `ADDED_TO_PROJECT`, `REMOVED_FROM_PROJECT`; sự kiện dự án: `PROJECT_CREATED`,
`ASSET_ADDED`, `ASSET_REMOVED`, `PROJECT_ARCHIVED`.

- [ ] Test trước (chạy thấy đỏ):
  - tạo, sửa (409 khi `version` cũ), danh sách theo `status`, phân trang;
  - thêm bản: `DESIGN_IN_OTHER_PROJECT`, `DESIGN_ARCHIVED`, `PROJECT_FULL` ở bản thứ 21,
    `PROJECT_ARCHIVED`;
  - gỡ: `DESIGN_PENDING` khi bản PENDING_REVIEW;
  - đóng dự án: `PROJECT_HAS_PENDING` khi còn bản chờ duyệt; đóng rồi thì không thêm được;
  - `POST /designs` có `projectId` thì bản vào dự án;
  - bản sửa (revision) của bản thuộc dự án ACTIVE vào cùng dự án, của dự án ARCHIVED thì không
    (BR-22);
  - mỗi thao tác ghi đúng sự kiện lịch sử;
  - dữ liệu IndexedDB dạng cũ nạp lên được và có danh sách dự án rỗng (Trọng tâm review 1);
  - `/design-projects…` đi qua mock ở chế độ chỉ-design.
- [ ] Làm cho test xanh; `pnpm exec vitest run src/lib/api` xanh.

### Task 2: Lớp dữ liệu của feature cho dự án

**File:** sửa `schemas.ts` (hoặc tạo `project-schemas.ts`), `types.ts`; tạo `api-projects.ts` (được
`api.ts` re-export); sửa `queries.ts`, `mutations.ts`, `errors.ts` (mã lỗi mới), `selectors.ts`
(`EVENT_LABELS` cho sự kiện mới), `lifecycle.ts` (hoặc `project-rules.ts`), `index.ts`; test
`__tests__/projects-api.test.ts`, `__tests__/project-rules.test.ts`.

**Dùng:** route mock của Task 1.
**Tạo ra:**
- `designProjectSchema`, `DesignProject`; trường `project` của `Design`; các schema đầu vào
  `projectCreateInputSchema`, `projectUpdateInputSchema` (zod, giới hạn 200 / 2.000 ký tự).
- `projectKeys` (`all`, `lists`, `list(params)`, `details`, `detail(id)`, `designs(id)`,
  `library(id)`, `history(id)`).
- Hook đọc: `useProjects(params)`, `useProject(id)`, `useProjectDesigns(id)`,
  `useProjectHistory(id)`.
- Hook ghi: `useCreateProject`, `useUpdateProject`, `useArchiveProject`, `useAddDesignToProject`,
  `useRemoveDesignFromProject`. Mỗi hook làm mới dữ liệu theo spec §4.
- Quy tắc khoá giao diện, viết thành hàm thuần:
  - `projectActions(project, designs): { createDesign, addDesign, archive, submitSet }`, mỗi mục là
    `{ allowed: boolean; reason?: string }`;
  - `canRemoveFromProject(design)`.
  - Lý do viết bằng tiếng Việt, ví dụ "Dự án đã đủ 20 bản", "Còn bản đang chờ duyệt".
- `useCreateDesign` nhận `projectId` không bắt buộc.

- [ ] Test trước:
  - parse DTO đúng và sai;
  - các hàm quy tắc với dự án ACTIVE / ARCHIVED, đủ 20 bản, có bản chờ duyệt;
  - mỗi mutation làm mới đúng các key (spy `invalidateQueries`).
- [ ] Làm cho test xanh; `pnpm run typecheck`.

### Task 3: Thư viện dự án (mock + dữ liệu)

**File:** tạo `src/lib/api/mock-fixtures/design-store-library.ts`; sửa `design-store-files.ts` (sao
chép file), `mock-design.ts`; feature: schema `libraryItemSchema` (theo `kind` `IMAGE` / `TEXT`,
`style` đúng các trường của `TextElement`), `api-projects.ts`, `queries.ts`, `mutations.ts`; test
`design-store-library.test.ts`, `__tests__/library-api.test.ts`.

**Tạo ra:**
- API mock: `GET /design-projects/{id}/library`, `POST …/library/images` (multipart, khoá chống
  trùng), `POST …/library/images/from-design` `{ designId, assetId }`, `POST …/library/texts`
  `{ text, style }`, `DELETE …/library/{itemId}`, `POST /designs/{id}/assets/from-library`
  `{ libraryItemId }` → `DesignAsset`.
- Hook: `useProjectLibrary(id)`, `useUploadLibraryImage(id)`, `useSaveImageToLibrary(id)`,
  `useSaveTextStyle(id)`, `useDeleteLibraryItem(id)`, `usePlaceFromLibrary(designId)`.

- [ ] Test trước:
  - giới hạn 30 ảnh và 30 mẫu chữ (`LIBRARY_FULL`);
  - ảnh sai ràng buộc mặc định bị từ chối;
  - sao chép vào bản kiểm theo ràng buộc của quy cách bản đó (`FILE_RULE` kèm ràng buộc);
  - xoá mục thư viện không làm mất ảnh trong bản đã dùng (BR-18);
  - dự án ARCHIVED: thêm hay xoá bị từ chối, đặt vào bản thì vẫn được (A-E2);
  - sự kiện `ASSET_ADDED` / `ASSET_REMOVED`.
- [ ] Làm cho test xanh.

### Task 4: Hàm co giãn bố cục `retargetDocument`

**File:** tạo `src/features/product-design/engine/document/retarget.ts` (re-export ở
`engine/index.ts`); test `engine/__tests__/retarget.test.ts`.

**Tạo ra:** `retargetDocument(document: DesignDocument, from: CustomizationTemplate, to:
CustomizationTemplate): { document: DesignDocument; dropped: number }` theo Q4. Tài liệu kết quả có
`templateCode = to.code`, `sku = to.sku`; chỉ giữ mặt in có trong `to` (các phần tử ở mặt in bị bỏ
được đếm vào `dropped`); nền chép nguyên; `placement` sau khi đổi được kẹp bằng `clampPlacement`.

- [ ] Test trước, dùng fixture `cup12oz`, `bagM` cùng một template ly và túi cỡ khác dựng trong test:
  - phần tử ở tâm vẫn ở tâm;
  - phần tử ở 1/4 bề ngang vẫn ở 1/4;
  - `scale` nhân đúng `s`;
  - mặt in đích không có thì bị bỏ và `dropped` đúng;
  - ly hình quạt sang ly hình quạt giữ tỉ lệ góc;
  - chữ uốn (`wrap`) giữ nguyên `wrap`;
  - phần tử sát mép bị kẹp vào vùng in (Trọng tâm review 4);
  - nhỏ → lớn rồi lớn → nhỏ ra lại vị trí cũ (sai số < 0,01 mm);
  - kết quả parse được bằng schema tài liệu.
- [ ] Làm cho test xanh; `pnpm exec vitest run src/features/product-design/engine`.

### Task 5: Nhân bản sang variant khác

**File:** mock: `design-store-designs.ts` (`POST /designs/{id}/clones`), `mock-design.ts`; feature:
`api-designs.ts`, `mutations.ts` (`useCloneDesign`), tạo `components/clone-design-dialog.tsx`; sửa
`components/design-card.tsx` (nút "Nhân bản sang cỡ khác"); test `design-store.test.ts` (clone),
`__tests__/clone-design-dialog.test.tsx`.

**Dùng:** `retargetDocument` (Task 4), `usePrintConfigs` / `usePrintConfig` hiện có, `useProject`
(Task 2).
**Tạo ra:**
- `useCloneDesign(id)`: gọi `POST /designs/{id}/clones` `{ variantSku, document }`.
- `CloneDesignDialog({ design, open, onOpenChange })`:
  - Liệt kê các variant khác của **cùng product** đang Active và có cấu hình in dùng được; danh
    sách variant lấy từ catalogue đang được truyền vào màn hình.
  - Tính bố cục bằng `retargetDocument`, gọi API, rồi `router.push` tới studio của bản mới.
  - Báo số phần tử bị bỏ. Theo A-E3, nếu bản mới không vào dự án thì nói lý do.

- [ ] Test trước:
  - mock: variant khác product hoặc không có cấu hình in → `VARIANT_NOT_ELIGIBLE`;
  - ảnh được sao chép vào bản mới;
  - bản mới vào dự án gốc khi còn chỗ; dự án đầy hoặc đã đóng → không vào, kèm lý do;
  - hộp thoại: chỉ hiện variant hợp lệ; xác nhận thì gọi API với tài liệu đã co giãn và mở studio
    bản mới; lỗi mạng hiện Thử lại.
- [ ] Làm cho test xanh.

### Task 6: Danh sách dự án và chuyển trang

**File:** tạo `src/app/(storefront)/design/projects/page.tsx`, `components/project-list-screen.tsx`,
`components/project-card.tsx`, `components/create-project-dialog.tsx`,
`components/design-section-switch.tsx`; sửa `design-list-screen.tsx` (đặt switch), `design-card.tsx`
(nhãn tên dự án), `src/lib/constants/routes.ts` (`STORE_ROUTES.design.projects`,
`project(id)`, `projectSubmit(id, ids)`); test `__tests__/project-list-screen.test.tsx`.

**Dùng:** `useProjects`, `useCreateProject` (Task 2).
**Tạo ra:**
- Trang `/design/projects` có tab `active` / `archived` và số trang trên URL (nuqs, như
  `design-list-tabs.ts`).
- Thẻ dự án như spec §5.
- "Tạo dự án" mở hộp thoại react-hook-form + zod; tạo xong thì sang trang dự án.
- Trạng thái rỗng: chưa có dự án; tab Đã đóng trống.
- Có khung chờ, lỗi kèm Thử lại; chưa đăng nhập thì hiện màn hình đăng nhập như "Thiết kế của tôi".
- Gắn `MockReviewPanel`.

- [ ] Test trước:
  - đổi tab thì URL đổi và trang về 1;
  - tạo dự án: báo lỗi khi tên rỗng hoặc dài quá 200 ký tự; tạo xong thì chuyển trang;
  - hai trạng thái rỗng khác nhau;
  - nhãn tên dự án trên thẻ bản.
- [ ] Làm cho test xanh.

### Task 7: Trang dự án — đầu trang, các bản, thành viên

**File:** tạo `src/app/(storefront)/design/projects/[id]/page.tsx`,
`components/project-screen.tsx`, `components/project-header.tsx`,
`components/project-designs.tsx`, `components/add-designs-dialog.tsx`,
`components/design-3d-dialog.tsx`, `components/submit-set-bar.tsx`; sửa luồng tạo bản: hộp thoại
`new-design-dialog.tsx` và `new-design-screen.tsx` mang `projectId` qua URL
(`/design/new?product&sku&project`); test `__tests__/project-screen.test.tsx`.

**Dùng:** hook của Task 2, `CloneDesignDialog` (Task 5).
**Tạo ra:**
- Màn hình theo spec §5:
  - đổi tên tại chỗ; đóng dự án có xác nhận;
  - lưới bản 1 / 2 / 3 cột; nút trên thẻ: Mở studio, Nhân bản, Gỡ;
  - "Xem 3D" tải viewer khi bấm;
  - "Thêm bản sẵn có" chỉ liệt kê bản hợp lệ;
  - "Tạo bản mới trong dự án";
  - dải thông báo lượt duyệt đang mở;
  - dự án ARCHIVED chỉ xem;
  - 404 "Không tìm thấy dự án".
- Ô chọn trên bản nháp và thanh `SubmitSetBar`: nút "Gửi duyệt cả bộ" mở
  `STORE_ROUTES.design.projectSubmit(id, ids)`. Nút khoá kèm lý do khi chưa đủ 2 bản hoặc dự án đã
  đóng.

- [ ] Test trước:
  - các bản hiện cạnh nhau với trạng thái;
  - gỡ bị khoá với bản chờ duyệt;
  - thêm bản sẵn có;
  - tạo bản trong dự án mang đúng `projectId`;
  - đóng dự án bị khoá khi còn bản chờ duyệt;
  - ARCHIVED ẩn mọi nút thêm, tạo, gửi;
  - chọn 1 bản thì nút gửi bị khoá và nêu lý do (Trọng tâm review 5);
  - 404.
- [ ] Làm cho test xanh.

### Task 8: Trang dự án — thư viện; studio — header, thư viện, mẫu chữ, lưu vào thư viện

**File:** tạo `components/project-library.tsx` (trang dự án), `components/studio/project-library-images.tsx`,
`components/studio/project-text-styles.tsx`; sửa `components/studio/image-tool-panel.tsx`,
`text-tool-panel.tsx`, `text-actions.ts` (`placeTextStyle`), `text-bar.tsx` và `image-bar.tsx` (mục
trong "Thêm"), `studio-header.tsx` và `studio-back-link.tsx` (tên dự án, link quay về dự án), và
nếu cần `asset-drag.ts` (kéo mục thư viện); test `__tests__/project-library.test.tsx`,
`__tests__/studio-project.test.tsx`.

**Dùng:** hook của Task 3; `placeImage(services, asset, at?)`, `placeText` hiện có.
**Tạo ra:**
- `placeTextStyle(services, item: LibraryTextItem): string | null`: tạo phần tử chữ với nội dung và
  kiểu đã lưu; nếu khung chữ rộng hơn vùng an toàn thì giảm `placement.scale` cho vừa.
- Phía trang dự án: thư viện có tab Ảnh và Chữ theo spec §5 (tab Chữ theo Q2).
- Phía studio:
  - nhóm "Thư viện dự án" ở bảng Ảnh: bấm hoặc kéo vào khung vẽ thì sao chép rồi đặt;
  - nhóm "Mẫu chữ của dự án" ở bảng Chữ;
  - "Lưu thành mẫu chữ của dự án" và "Lưu ảnh vào thư viện dự án" trong "Thêm" (khoá kèm lý do khi
    đầy hoặc dự án đã đóng);
  - header hiện tên dự án, nút quay lại về trang dự án.

- [ ] Test trước:
  - đặt ảnh từ thư viện gọi API sao chép rồi tạo phần tử;
  - `FILE_RULE` hiện lỗi và không đặt;
  - đặt mẫu chữ quá rộng thì thu nhỏ cho vừa vùng an toàn;
  - lưu mẫu chữ ghi đúng các trường kiểu chữ;
  - thư viện đầy thì nút lưu bị khoá kèm lý do;
  - header và nút quay lại trỏ về dự án;
  - bản không thuộc dự án không thấy gì mới;
  - bản chỉ xem không có bảng Ảnh và Chữ;
  - trang dự án: tải ảnh lên, xoá có xác nhận, bộ đếm "n/30".
- [ ] Làm cho test xanh.

### Task 9: Bộ chạy gửi duyệt tách khỏi studio

**File:** tạo `components/submission/load-design-session.ts`, `components/submission/run-submission.ts`
(hoặc tên tương đương trong `components/studio/`); sửa `submission-checks.ts`,
`use-design-submission.ts` để dùng bộ chạy; test `__tests__/run-submission.test.ts`. Các test hiện
có `use-design-submission.test.tsx`, `submit-dialog.test.tsx`, `submission-bundle.test.ts` phải xanh
mà không sửa ý nghĩa.

**Tạo ra:**
- `loadDesignSession(client: QueryClient, designId: string, fonts: FontRegistry):
  Promise<DesignSession>`. Nó tải bản, tài liệu, cấu hình in, ảnh (`ImageCache`) và trạng thái phông,
  rồi dựng `editor` (`createEditor`), `template`, `surfaces`, `sizer`, `measure`, `layerCache` và
  `ExportRenderer` (`createCanvasExportRenderer`, không có viewer trên màn hình).
- `DesignSession` có `release()`.
- `checkSession(session): Promise<{ document, report, checksum }>`: chạy `runPreflight` trên đúng
  tài liệu đã lưu.
- `buildSessionBundle(session, checked, onStep)`: dựng bộ file bằng `buildSubmissionBundle`.

- [ ] Test trước:
  - bộ chạy kiểm tra và dựng file của một bản mock mà không cần studio (`TEST_FONTS`);
  - preflight không đạt thì trả đúng lỗi;
  - `release()` giải phóng renderer;
  - luồng "Gửi duyệt" trong studio không đổi (các test cũ xanh).
- [ ] Làm cho test xanh.

### Task 10: Gửi duyệt cả bộ

**File:** mock: tạo `design-store-rounds.ts` (`POST /designs/{id}/submission-uploads`, `POST
/design-projects/{id}/review-rounds`, xoá upload quá 24 giờ theo A-E4), sửa `mock-design.ts`;
feature: `api-projects.ts`, `mutations.ts` (`useSubmissionUpload`, `useOpenReviewRound`); tạo
`src/app/(studio)/design/projects/[id]/submit/page.tsx` (nạp `STUDIO_FONTS`, theo Q1),
`components/submit-set-screen.tsx`, `components/submit-set-rows.tsx`; test
`design-store-rounds.test.ts`, `__tests__/submit-set-screen.test.tsx`.

**Dùng:** bộ chạy của Task 9; `recordPreflightFailure` hiện có.
**Tạo ra:** màn hình theo spec §8 với các bước kiểm tra → xác nhận → dựng và tải lên → mở lượt
duyệt; dòng lỗi có link "Mở studio để sửa"; cảnh báo `beforeunload`; "Thử lại" chạy tiếp từ chỗ dở;
hủy được trước bước mở lượt. Xong thì về trang dự án.

- [ ] Test trước:
  - mock:
    - dưới 2 bản → `SET_TOO_SMALL`;
    - `version` đổi → `VERSION_CHANGED` nêu tên bản và không bản nào đổi trạng thái;
    - dự án ARCHIVED → `PROJECT_ARCHIVED`;
    - thành công → mọi bản PENDING_REVIEW, sự kiện `SUBMITTED_FOR_REVIEW` ghi mã lượt;
    - tải lại cùng khoá thì không tạo upload trùng;
  - màn hình:
    - một bản không đạt → không gửi bản nào, dòng lỗi đúng, ghi lỗi vào lịch sử;
    - tất cả đạt → xác nhận → tiến độ từng dòng → mở lượt;
    - lỗi mạng giữa chừng → Thử lại chạy tiếp, không dựng lại bản đã xong (Trọng tâm review 3);
    - hủy thì không gửi gì.
- [ ] Làm cho test xanh.

### Task 11: Giả lập lượt duyệt dự án

**File:** sửa `design-store-simulation.ts` (duyệt / trả lại từng bản trong lượt, "Duyệt tất cả",
công tắc lỗi theo Q5, tự đóng lượt), `simulation.ts` của feature, `mock-review-panel.tsx`,
`mock-review-actions.tsx`; gắn `MockReviewPanel` ở `/design/projects` và `/design/projects/[id]`
(nếu Task 6, 7 chưa gắn); test `design-store-simulation` (hoặc `design-store.test.ts`),
`__tests__/mock-review-panel.test.tsx`.

- [ ] Test trước:
  - "Duyệt tất cả" có một bản bật công tắc lỗi → bản đó ở lại PENDING_REVIEW, các bản khác APPROVED;
  - lượt tự đóng khi bản cuối có quyết định;
  - bản trả lại về DRAFT và gửi lại được, lẻ hoặc trong lượt mới;
  - bảng giả lập hiện lượt đang mở với từng bản.
- [ ] Làm cho test xanh.

### Sau các task (controller)

1. Review toàn nhánh, rồi sửa một đợt.
2. Chạy `pnpm run validate`.
3. Kiểm tra trên trình duyệt (1440 px và điện thoại cho các trang dự án; 1440 px cho studio và trang
   gửi cả bộ): tạo dự án, thêm bản, thư viện ảnh và chữ, nhân bản, gửi cả bộ có một bản lỗi rồi
   thành công, giả lập duyệt, đóng dự án.

**Thứ tự:** 1 → 2 → 3. Task 4 chạy song song với 1–3 (chỉ engine). Task 9 chạy song song với 5–8
(chỉ phần gửi duyệt). Sau đó 5 → 6 → 7 → 8, rồi 10 → 11.

## Việc còn chờ người dùng

- **Dữ liệu để thử nhân bản sang cỡ khác.** Trong mock catalogue hiện tại, mỗi cỡ ly là một product
  riêng (ví dụ `ly-giay-2-lop-8oz`, ly 12oz). Variant của cùng product chỉ khác màu hoặc chất liệu,
  cùng một khuôn. Nhân bản vẫn chạy nhưng chỉ ra cùng cỡ.
- Muốn thử được 500 ml → 700 ml cần thêm vào mock catalogue (`src/lib/mock-data.ts`, file chung của
  catalog) một product có trục Dung tích (như docs 01 §4.2: "Dung tích × Chất liệu"), cùng cấu hình
  in cho từng cỡ trong `design-print-configs.ts`.
- Chỉ làm khi người dùng cho phép sửa file đó (Task 5).
