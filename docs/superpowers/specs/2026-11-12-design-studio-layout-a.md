# Module 12 — studio layout A, "asset panel" (design)

Date: 2026-11-12. Branch: `feat/design-m12-a-foundation`. Chosen from the three directions on the
layout page (direction A). Replaces the four-column studio layout of
`components/studio/studio-workspace.tsx`. Desktop only, as before (≥ 1024 px, `DesktopOnlyGate`).

## 1. Goal

The sheet and the 3D cup are the subject; everything else is reachable in one click and out of the
way. The layout follows the editors customers already know (Canva, Pacdora): a labelled rail on the
left opens one wide panel of things to take (pictures already uploaded, text styles, backgrounds),
the selected element's properties run along one bar under the header, and the 3D cup is a preview
pinned in the corner that can swap places with the sheet.

## 2. Screen

```
┌ header: ‹ name · saved · undo/redo ············ check chip · Gửi duyệt ┐
├ context bar: what is selected and its properties ········ print area ┤
├ rail ┬ panel (288 px, closable) ┬ stage: the sheet ───────────────────┤
│ Ảnh  │ Ảnh của bạn               │                                    │
│ Chữ  │  [Tải ảnh lên]            │          (fan dieline)             │
│ Vẽ   │  ▢ ▢                      │                     ┌ Xem 3D ⟲ ⇄ – ┐│
│ Tẩy  │  ▢ ▢                      │                     │    cup        ││
│ Nền  │                           │ − 100% + Vừa khung  └───────────────┘│
│ Lớp  │                           │                                    │
│ Kiểm │                           │                                    │
└──────┴───────────────────────────┴────────────────────────────────────┘
```

- **Header** (`StudioHeader`): back, name (rename in place), save state, undo/redo, then on the
  right a **check chip** that summarises preflight ("Kiểm tra: đạt", "2 lỗi", "1 lưu ý"; colour
  from the semantic tokens) and opens the Kiểm tra panel, and the primary action (`PrimaryAction`).
- **Context bar** (new, 44 px): the selected element's name and its properties laid out across one
  row; with nothing selected, a short hint. The print-area switcher (`SurfaceTabs`, several faces on
  a bag) sits at its right end.
- **Rail** (72 px, icon over a short label): Chọn, Ảnh, Chữ, Vẽ, Tẩy, Nền, then Lớp, Kiểm tra and
  Lịch sử (Lịch sử only when the design has a history). Tool items set the tool as today
  (`STUDIO_TOOLS`, same shortcuts); Lớp, Kiểm tra and Lịch sử only open their panel.
- **Panel** (288 px): the active item's content. Clicking the active item again, `Esc` or the
  panel's close button closes it and gives the stage the width. Chọn closes it.
- **Stage**: `CanvasStage`, unchanged, with its zoom bar at the bottom left.
- **3D preview** (`ViewerHost`): a card pinned bottom right of the stage (300 × 320 px) with
  "Xem 3D", auto-rotate, **Đổi chỗ** (the cup fills the stage and the sheet becomes the card;
  press again to swap back) and minimise (the card folds to a "3D" pill).

## 3. What moves where

| Today | Layout A |
|---|---|
| `ToolRail` (icons only) | Rail with labels, plus Lớp, Kiểm tra, Lịch sử |
| `ToolPanel` column, always open | Panel, opened from the rail, closable |
| `image-tool-panel` | Panel "Ảnh của bạn": upload, then a grid of the pictures this design already holds (click = place on the sheet, drag onto the sheet = place there) |
| `text-tool-panel`, `brush-tool-panel`, `background-tool-panel` | Same content, in the panel |
| `SidePanel` tab Thuộc tính (`PropertiesPanel` + sections) | Context bar |
| `SidePanel` tabs Lớp, Kiểm tra, Lịch sử | Rail items → panel (`LayersPanel`, `PreflightPanel`, `DecisionHistory`, unchanged inside) |
| 3D column over the side panel | Corner card with swap and minimise |

### Context bar contents

One row, left to right; anything that does not fit goes behind a "Thêm" popover rather than
wrapping. Inline controls are 36 px high (44 px hit area kept by padding).

- **All elements:** Vị trí (popover: X, Y, góc xoay, tỉ lệ — today's `TransformFields`), Độ mờ
  (popover slider), Lên lớp / Xuống lớp, Nhân bản, Xoá, Sao chép sang mặt khác (`CopyToFace`,
  only where there is another face).
- **On a cup:** Uốn theo thân ly (switch) for text and images.
- **Text:** font (`FontCombobox`), size (pt), colour (popover `ColorField`), bold, italic, align;
  "Thêm": outline colour and width, letter spacing, line height.
- **Image:** the DPI badge (`DpiBadge`), flip horizontal and vertical.
- **Drawing:** what `DrawingProperties` shows today.

The fields themselves are the existing components; only their container changes. The vertical
`PropertiesPanel` stops being used.

## 4. 3D preview fixes (same change)

- **Light follows the viewer.** Today the `RoomEnvironment` is fixed in the scene while
  `OrbitControls` moves the camera, so one side of the cup is always bright. Each time the camera
  moves, `scene.environmentRotation.y` takes the camera's azimuth; without the environment, the key
  light is a child of the camera.
- **A flatter, eye-level view.** Home view about 5° above the cup's middle (today about 14°), field
  of view 22° (today 30°) with the camera further back, so horizontal lines of the print read
  straight as on a product photo. "Nhìn thẳng" returns to it.

## 5. States

- **Read-only** (pending review, approved): no rail, panel or context bar; the stage and the 3D card
  share the screen as today's read-only layout does, with the status banner under the header.
- **Loading:** the skeleton follows the new grid (header, bar, rail, stage, card).
- **Narrow desktop (1024–1279 px):** the panel opens over the stage instead of beside it.

## 6. Out of scope

New tools (shapes, templates), the morph or wrapping animations from the earlier prototypes, and
any change outside `src/features/product-design` and `src/app/(studio)`.

## 7. Tests

- Rail: a tool item sets the tool and opens its panel; the active item closes it; Lớp, Kiểm tra and
  Lịch sử open their panel without changing the tool; shortcuts unchanged.
- Context bar: the right controls for text, image, drawing and nothing selected; the wrap switch only
  on a cup; values write through the same commands as today.
- 3D card: swap and minimise, keyboard reachable; read-only layout has no rail, panel or bar.
- Check chip: the summary for pass, fail and notes; it opens the Kiểm tra panel.
- Viewer: the environment's yaw equals the camera's azimuth after an orbit (pure function test);
  the home view constants.
