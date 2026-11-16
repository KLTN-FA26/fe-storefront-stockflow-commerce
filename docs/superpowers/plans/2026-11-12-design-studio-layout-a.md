# Studio layout A — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use
> checkbox (`- [ ]`) syntax.

**Goal:** the studio becomes direction A: header with a check chip, a context bar of the selection's
properties, a labelled rail that opens one closable panel, the sheet in the middle and the 3D cup as
a corner card that swaps with it; the 3D light follows the viewer and the view sits at eye level.

**Architecture:** the studio's grid in `studio-workspace.tsx` is rebuilt; existing panels and fields
are reused inside new containers (rail, panel, context bar, corner card). Swapping the sheet and the
cup is done with CSS on two sibling containers, never by moving the canvases (a remount would lose
the WebGL context and the stage's state).

**Tech stack:** React 19, Tailwind v4 tokens, shadcn/Radix (Popover, Tooltip, Switch, ToggleGroup),
three.js (viewer), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-11-12-design-studio-layout-a.md`.

## Global constraints

- Everything in `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\deferred\constraints.md`
  (pnpm only, never `git stash` / `git add` / commit, no formatter on whole directories, no `any` /
  `@ts-ignore` / `eslint-disable`, no subagents, TDD, Vietnamese UI copy, tokens only, 44 px
  targets, visible focus).
- Only `src/features/product-design/**` and `src/app/(studio)/**` change (design scope).
- Reuse the existing field components and commands; no behaviour change to what a field writes.
- Desktop only (≥ 1024 px, `DesktopOnlyGate`); no phone or tablet layout.

## Review focus

1. Keyboard: every rail item, panel, context-bar control and the 3D card's buttons reachable and
   operable; `Esc` closes the panel; tool shortcuts (V, U, T, B, E, G) unchanged.
2. Swap: after swapping and back, the stage keeps zoom, selection and the viewer keeps its camera.
3. Read-only designs (pending, approved): no rail, panel or context bar; nothing editable reachable.
4. 1024 px wide window: the panel overlays the stage; nothing overflows horizontally.
5. A bag (four faces): the print-area switcher in the context bar; "Sao chép sang mặt khác" there.

---

### Task 1: Context bar

**Files:** create `components/studio/context-bar.tsx` (and small parts files if it passes ~150 lines)
+ `__tests__/context-bar.test.tsx`.

**Produces:** `ContextBar({ sections, onEditText })` — renders, for the current selection:
"Vị trí" popover (`TransformFields`), "Độ mờ" popover slider, layer up/down, duplicate, delete,
`CopyToFace` where another face exists, the wrap switch (text/image on a sector surface), and the
type's own controls (text: font, size, colour popover, bold, italic, align, "Thêm" popover for
outline, letter spacing, line height; image: `DpiBadge`, flip X/Y; drawing: what
`DrawingProperties` shows). Nothing selected: a one-line hint. The surface switcher slot at the end
(`SurfaceTabs` is passed in by the workspace in Task 2).

- [ ] Tests first: text / image / drawing / nothing selected show the right controls; the wrap switch
  only on a cup; changing size, colour, wrap and opacity dispatches the same editor commands the
  vertical panel did today (assert the document after the change); popovers open and close with the
  keyboard.
- [ ] Implement; `pnpm exec vitest run src/features/product-design` green.

### Task 2: Shell — grid, labelled rail, closable panel

**Files:** modify `components/studio/studio-workspace.tsx`, `tool-rail.tsx`, `tool-panel.tsx`;
create `components/studio/studio-panel.tsx` (panel container and its open/close state); stop using
`side-panel.tsx` and `properties-panel.tsx` (delete them when nothing imports them; move any test
coverage they had onto the context bar or the panel); update the studio tests that queried the old
layout.

**Behaviour (spec §2):** header / context bar / [rail | panel | stage]. Rail items: the six tools
(labels under icons, shortcuts unchanged) then Lớp, Kiểm tra, Lịch sử (only with a history). A tool
item sets the tool and opens its options; Lớp / Kiểm tra / Lịch sử open their panel without changing
the tool; the active item again, `Esc` or the panel's close button closes the panel. Width 288 px;
below 1280 px the panel overlays the stage. The 3D preview sits as a card bottom-right of the stage
(Task 3 adds swap and minimise).

- [ ] Tests first: rail → panel behaviours above; shortcuts still switch tools; the context bar is
  mounted with the surface switcher; read-only shows no rail, panel or bar.
- [ ] Implement; tests green; `pnpm run typecheck`, `pnpm run lint`.

### Task 3: 3D corner card — swap, minimise, skeleton

**Files:** modify `components/studio/viewer-host.tsx`, `viewer-toolbar.tsx`, `studio-workspace.tsx`
(slot classes only), `studio-skeleton.tsx`; tests in `__tests__/`.

**Behaviour:** card 300 × 320 px with "Xem 3D", auto-rotate, **Đổi chỗ**, minimise (folds to a "3D"
pill that restores). Swap toggles which of the two sibling containers fills the stage and which is
the card, by class only. The colour disclaimer stays visible with the 3D view. The skeleton matches
the new grid.

- [ ] Tests first: swap and back keep the same canvas elements mounted (assert element identity);
  minimise / restore; buttons have labels and are keyboard reachable; skeleton regions.
- [ ] Implement; tests green.

### Task 4: Check chip and the image library

**Files:** modify `components/studio/studio-header.tsx` (chip), `image-tool-panel.tsx` (library);
tests.

**Behaviour:** chip text from the current preflight result — "Kiểm tra: đạt" / "Kiểm tra: N lỗi" /
"Kiểm tra: N lưu ý", semantic tone tokens; clicking opens the Kiểm tra panel (Task 2's panel API).
Image panel: upload as today, then a grid of the design's assets (`listDesignAssets` through its
React Query hook): click places it (`placeImage`), dragging a tile onto the stage places it at the
drop point (convert the drop point with the stage's existing pointer-to-surface mapping).

- [ ] Tests first: chip text and tone for pass, fail, notes; chip opens Kiểm tra; library lists the
  assets, click places one, keyboard Enter places one; drop places at the dropped point.
- [ ] Implement; tests green.

### Task 5: 3D light and camera

**Files:** `engine/viewer3d/staging.ts`, `engine/viewer3d/product-viewer.ts`; tests in
`engine/__tests__/`.

**Produces:** `environmentYaw(camera: Vector3, target: Vector3): number` (the camera's azimuth about
the target, around +Y); the viewer sets `scene.environmentRotation.y` to it on every controls change;
without the environment the key light is a child of the camera. Home polar angle so the view is about
5° above the target, `FOV_DEG = 22`, distance re-fitted; "Nhìn thẳng" (`controls.reset()`) returns to
it.

- [ ] Tests first: `environmentYaw` for cameras at front, right, back and left; the viewer updates the
  environment rotation after a controls change (fake controls/renderer as the existing viewer tests
  do); the home constants.
- [ ] Implement; `pnpm exec vitest run src/features/product-design/engine` green.

### After the tasks (controller)

Whole-branch review → one fix wave → `pnpm run validate` → browser check of the studio at 1440 and
1024 px wide: rail and panel, context bar for text and image, swap and minimise, check chip, image
library, read-only design, 3D light while orbiting.

**Order:** Task 5 runs beside Tasks 1–2 (separate files). Task 4 runs beside Task 3 after Task 2.
