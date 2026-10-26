# Design Studio 3D — product design engine for cups and kraft bags (Module 12)

- Date: 2026-10-25
- Branch: `feat/design-studio-3d` (from `origin/dev`)
- Status: approved in brainstorming (sections 1–6), pending spec review
- Sources read: BE `origin/develop` @ `92bcd760` (module `design`, `product` migrations, `common/storage`),
  docs `D:\FPTU\docs\docs` (`ecommerce/12-product-design`, `13-catalog`, `14-cart-and-order`, `glossary`,
  `open-questions` B3–B9, `warehouse/01-product-creation`, `warehouse/19-production`), BE
  `docs/business-design/{03-state-machines,04c-all-flows,05-business-rules,2026-10-06-b2b-production-plan}.md`

## 1. Intent

### What the user said

- The current design UI on the storefront is not production quality and cannot serve what customers need.
- A customer must be able to see the product (cup, packaging) as photos and as a 3D model, draw/design on it,
  place uploaded images (logos), and preview on the 3D model how the printed product will look.
- Build an independent, strong 3D preview + design mechanism for the web. What the BE does not provide yet is
  built on the FE first; where the BE deviates, say so explicitly.

### Decisions taken during brainstorming

| Topic                                | Decision                                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shapes in v1                 | Paper/PET **cups** (truncated cone) and **kraft bags** (4 printable faces + handles). Boxes and sleeves later                                                  |
| 3D model source                      | **Parametric** meshes generated from dimensions; a GLB/glTF port exists for `model_3d_url` later                                                               |
| Persistence while BE lacks endpoints | FE codes against a **proposed API contract**, served by the mock adapter (`USE_MOCK`)                                                                          |
| Editor tools in v1                   | Upload image/logo, **Text**, **Freehand brush + eraser**, **Background colour / pattern** (no shapes/clipart)                                                  |
| Interaction model                    | **2D editing is primary, 3D live preview side by side**; clicking the 3D model selects a surface/element                                                       |
| Architecture                         | **A — own engine**: framework-agnostic TS core (document in mm, cup/bag geometry, one compositor, preflight) + SVG interaction overlay + plain three.js viewer |

### Assumptions

- Customers are signed-in B2B accounts (catalog already requires sign-in since 2026-10-06).
- 3D is rendered client-side with WebGL (docs open question B7); fallback is a flat preview, not a server render.
- Product data follows the BE seed: `LYG-1L`, `LYG-2L`, `LYG-KRAFT`, `LYG-ESP` (paper cups), `LYN-PET` (PET cup),
  `TUI-KRAFT` (kraft bag).
- The end of the storefront design flow is a confirmed snapshot → quote/sample with Sales (B2B plan 2026-10-06),
  not "add to cart".

### Success criteria

1. In mock mode a customer goes PDP (customizable cup or bag) → "Bắt đầu thiết kế" → studio with the right model.
2. On every print area the customer can upload PNG/JPEG/WebP/SVG, add text, draw, erase, and set a background
   colour or pattern; the 3D model reflects each change within ~100 ms and can be rotated/zoomed.
3. A logo dragged around the cup stays upright on the 3D cup; text with "Uốn theo thân ly" reads horizontally on
   the 3D cup (no smile/frown distortion).
4. The `PRINT_READY` PDF has one page per print area, page size = bleed box in mm, the cup page carries the
   annular-sector cut path, and the raster is at `max(minDpi, 300)` DPI.
5. Preflight flags low DPI, content outside the print area, content on the cup seam and white ink on kraft; clicking
   an issue selects the element and shows its surface.
6. Undo/redo works per gesture; autosave shows "Đang lưu… / Đã lưu lúc HH:mm"; reloading restores the design.
7. Mock workflow end to end: request technical review → (mock) review passes → "Chốt thiết kế" → snapshot →
   "Tạo phiên bản mới".
8. Without WebGL the studio shows the flat preview with "Preview 3D không khả dụng"; the colour disclaimer is always
   visible next to any preview.
9. At 375 px the studio is usable: 2D/3D toggle, tools in sheets, 44 px targets, no horizontal page scroll.
10. `pnpm run validate` passes; engine pure modules reach ≥ 90 % line coverage.
11. Against the real BE, designs created by Sales are listed; every missing endpoint shows an explicit
    "chờ backend hỗ trợ" state instead of failing silently.

## 2. Current state and gaps

### 2.1 FE today

- `src/features/product-design/api.ts` keeps designs in an in-file `Map` (mock outside the mock adapter — breaks
  the data-layer rule). Schemas (`Draft/Ready/Confirmed/Locked/…`, elements in % x/y) do not match the BE.
- `components/storefront/design-canvas.tsx` renders absolutely positioned divs; nothing is interactive.
  `canvas-toolbar.tsx` buttons have no handlers. No 3D, no `three`, no canvas library installed.
- The editor offers "Thêm vào giỏ" for confirmed designs, which contradicts the B2B flow (§7.6).
- `STORE_ROUTES.design.new` (`/design/new`) has no page; today it would be caught by `design/[id]`.

### 2.2 BE `origin/develop` — what exists

| Endpoint (`/api/v1`)                                                      | Notes                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /designs?page&size`                                                  | Drafts where the caller is owner, assigned designer or reviewer                                                                                                        |
| `GET /designs/{id}` · `/{id}/history` · `/{id}/snapshot`                  | `DesignDraftResponse`, decision history, confirmed snapshot                                                                                                            |
| `PUT /designs/{id}/specification` `{version, spec}`                       | `spec` is text ≤ 4000 chars; resets technical review                                                                                                                   |
| `POST /designs/{id}/artifacts?role=` multipart `file` + `Idempotency-Key` | png/jpeg/webp/pdf ≤ 50 MB, magic-number + ClamAV checked; roles `CUSTOMER_PREVIEW`, `TECHNICAL_SPEC`, `PRINT_READY`, `PRODUCTION_INSTRUCTION`; resets technical review |
| `GET /designs/{id}/artifacts` · `/{artifactId}/download-url`              | Short-lived presigned link, `no-store`                                                                                                                                 |
| `POST /designs/{id}/technical-reviews`                                    | Assigned QC reviewer only (never owner or last editor)                                                                                                                 |
| `POST /designs/{id}/confirmation-requests`                                | DRAFT → SUBMITTED; needs a passed review and a current artifact                                                                                                        |
| `POST /designs/{id}/change-requests` · `/confirmation-withdrawals`        | SUBMITTED → DRAFT (owner / owner or designer)                                                                                                                          |
| `POST /designs/{id}/confirmations` `{version, artifactId}`                | Owner only; SUBMITTED → APPROVED + immutable snapshot with artifact manifest and checksum                                                                              |
| `POST /designs/{id}/revisions`                                            | Fork an APPROVED design into a new DRAFT (`parentSnapshotId`)                                                                                                          |

`DesignDraftResponse = {id, customerId, productId, ownerUserId, assignedUserId, reviewerUserId, name, spec, status,
currentArtifactId, technicalReviewPassed, reviewNotes, version, parentSnapshotId}`; `status ∈ DRAFT | SUBMITTED |
APPROVED` (`REJECTED` is declared but never set). Every write echoes `version` (optimistic lock → 409).

Product tables exist without any Java code or endpoint: `product.customization_templates` (`template_2d_url`,
`model_3d_url`, `min_dpi` default 150, `color_mode`, `allowed_file_formats`, `max_file_size_mb`, `max_colors`,
`allowed_font_codes`), `product.print_areas` (`x_mm, y_mm, width_mm, height_mm, safe_margin_mm, bleed_mm,
shape_json, uv_mapping_json`), `product.media.kind ∈ IMAGE | VIDEO | MODEL_3D`.

### 2.3 BE deviations and gaps (to report to the BE team)

| #   | Deviation / gap                                                                                                                             | Consequence                               | FE stance in this spec                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| G1  | `POST /designs` needs `design-administration:CREATE` (ECOMMERCE_ADMIN only) and an explicit QC reviewer                                     | A customer cannot start a design          | Proposed P1                                                                                     |
| G2  | Customization templates, print areas and 3D media have tables but no API                                                                    | FE cannot load print areas, DPI, model    | Proposed P2                                                                                     |
| G3  | `CatalogProductResponse` has no `kind`                                                                                                      | PDP cannot tell customizable products     | Proposed P2 (`kind`)                                                                            |
| G4  | BE docs F-DSG say "canvas JSON" + `design-snapshots/{id}.json`; code has only `spec` (4000 chars) and artifacts reject JSON                 | No editable design document is stored     | Proposed P3                                                                                     |
| G5  | BE docs mention `design-assets/{id}/*`; not implemented. Uploading a logo as an artifact would replace the current preview and reset review | No store for customer images              | Proposed P4                                                                                     |
| G6  | No automatic preflight (DPI, safe area, fonts). BE "preflight" is the manual QC review flag `preflightPassed`                               | Customers get no early feedback           | FE preflight engine (§8); QC stays the gate                                                     |
| G7  | Docs 12 lifecycle (`Ready/Confirmed/Locked/Superseded/Cancelled`) ≠ BE (`DRAFT/SUBMITTED/APPROVED`)                                         | Two vocabularies                          | FE follows the BE (§7.5)                                                                        |
| G8  | No print-ready generation (docs: PDF/CMYK with bleed)                                                                                       | Prepress has no file                      | FE renders RGB PDF; CMYK conversion stays with prepress/BE                                      |
| G9  | No signal "customer finished, please review"                                                                                                | QC does not know when to look             | Proposed P5                                                                                     |
| G10 | `DesignDraftResponse` lacks SKU, template, timestamps, thumbnail                                                                            | List and status derivation are weak       | Proposed P6                                                                                     |
| G11 | No column for parametric model parameters                                                                                                   | P2 cannot describe the parametric cup/bag | Add `model_params_json JSONB` to `customization_templates` (or carry them in `uv_mapping_json`) |

### 2.4 Conflicts inside the docs

- Low-resolution images: docs 12 edge case says `Warning` (customer may accept); BE `BR-DSG-001` says preflight
  fails below the configured minimum DPI. This spec uses (decided 2026-10-26, BA sign-off pending): below `minDpi` → Fail, below the print file's DPI `max(minDpi, 300)` → Warning (the image is upscaled when printed).
  ASSUMPTION (open-question: low-DPI policy) — needs the lead's decision.

## 3. Architecture

```
src/features/product-design/
├── engine/                 framework-agnostic TS: no React, Next, axios or lib/api imports
│   ├── document/           DesignDocument zod schema, pure commands, history (undo/redo), migrate()
│   ├── geometry/           units (mm↔px, pt), 2D affine, polar helpers, hit-testing, RDP simplify
│   ├── surfaces/           PrintSurface per shape: cup.ts (annular sector), bag.ts (rect faces), index.ts
│   ├── render/             compose() → DrawOp[]; execute(ops, ctx2d); text layout; image cache; brush; patterns; guides
│   ├── viewer3d/           ProductViewer class (three.js): cup/bag mesh builders, materials, lights,
│   │                       controls, texture binding, pick, screenshot, GLB loader port, WebGL detect
│   ├── preflight/          one file per rule group → PreflightReport
│   ├── export/             preview PNG, print-ready PDF and technical-spec PDF (pdf-lib, dynamic import)
│   ├── editor/             EditorController on zustand/vanilla: document, selection, tool, viewport,
│   │                       active surface, history, dirty surfaces
│   └── index.ts            the engine's only public entry
├── components/studio/      thin React: DesignStudio, StudioShell, ToolRail, ToolPanels, CanvasStage,
│                           InteractionOverlay (SVG), ViewerHost, LayersPanel, PropertiesPanel,
│                           PreflightPanel, WorkflowBar, DesktopOnlyGate
├── components/             DesignList, DesignCard, NewDesignLauncher
└── api.ts  schemas.ts  types.ts  queries.ts  mutations.ts  lifecycle.ts  selectors.ts  errors.ts  index.ts
```

Rules:

- **One source of truth.** The `DesignDocument` (mm) drives every output. The 2D view, the 3D texture, the preview
  PNG and the print file all come from the same compositor at different resolutions.
- **The engine does not know React.** `EditorController` and `ProductViewer` are plain classes/stores; React
  subscribes (`useStore`) and hosts canvases. Drags and brush strokes update the canvas and the 3D texture through
  `requestAnimationFrame`, not through React renders.
- **Boundaries.** `engine/**` imports nothing from `components/**`, `lib/api/**` or `next/*`.
  `components/studio/**` imports the engine only through `engine/index.ts`. `schemas.ts` reuses the document
  schema from `engine/document`. Nothing outside `src/lib/api/mock-adapter.ts` imports `src/lib/mock-data.ts`.
- **Code splitting.** The studio route loads the engine and three.js with `next/dynamic` (`ssr: false`) behind a
  layout-shaped skeleton. The design list page does not pull three.js.
- **New dependencies:** `three` + `@types/three`, `perfect-freehand`, `pdf-lib` (loaded only at export).
  Not used: `@react-three/fiber`, `drei`, Fabric.js, Konva.
- **Decision record.** `PRODUCTION-FRONTEND-RULES.md` lists R3F + Fabric/Konva as "not installed, add when needed".
  This spec deliberately uses plain three.js and an own 2D renderer because the cup's annular-sector geometry
  must be shared by editor, 3D and print output (§4.3), and per-frame texture updates must bypass React.
  The rules file is not edited.
- Files stay around 200 lines (feature) / 150 lines (component), split by responsibility.

## 4. Data model

### 4.1 Customization template (mirrors `product.customization_templates` + `print_areas`)

```ts
CustomizationTemplate {
  templateId: string; code: string; name: string; sku: string;          // template hangs off the variant (BE decision D5)
  minDpi: number;                                                        // default 150
  colorMode: "RGB" | "CMYK";
  allowedFileFormats: string[];                                          // e.g. ["image/png","image/jpeg","image/webp"]
  maxFileSizeMb: number;
  maxColors: number | null;
  allowedFontCodes: string[] | null;                                     // null = every font in the FE registry
  model:
    | { kind: "parametric-cup"; topDiameterMm; bottomDiameterMm; heightMm; rimMm; seamMm;
        bandTopOffsetMm; bandBottomOffsetMm; material: "paper-white" | "kraft" | "pet-clear" }
    | { kind: "parametric-bag"; widthMm; gussetMm; heightMm; topFoldMm;
        handle: "twisted" | "flat" | "none"; material: "kraft-brown" | "kraft-white" }
    | { kind: "gltf"; url: string; surfaces: { printAreaCode: string; meshName: string }[] };  // port, not enabled in v1
  printAreas: PrintArea[];
}

PrintArea {
  code: "BODY" | "FRONT" | "BACK" | "LEFT" | "RIGHT"; name: string;
  xMm; yMm; widthMm; heightMm;                       // bounding box on the 2D template (BE columns)
  safeMarginMm; bleedMm;
  shape: { type: "rect" }
       | { type: "annular-sector"; innerRadiusMm; outerRadiusMm; sweepRad; seamMm };   // shape_json
  uvMapping: { meshPart: string };                                                     // uv_mapping_json
}
```

The cup's sector is derived from the model parameters (§4.3); `shape_json` keeps a copy for prepress and a zod
refine checks the two agree within 0.1 mm. A bag has four rect areas: `FRONT`, `BACK` (width × printable height)
and `LEFT`, `RIGHT` (gusset × printable height, with a centre crease guide). Bottom and handles are not printable.

### 4.2 Design document

```ts
DesignDocument {
  schemaVersion: 1;
  templateCode: string; sku: string;
  surfaces: Record<PrintAreaCode, {
    background: { kind: "none" }
              | { kind: "color"; color: Hex }
              | { kind: "pattern"; patternId: PatternId; colors: [Hex, Hex]; scale: number; rotationDeg: number };
    elements: Element[];                              // array order = z-order, last on top
  }>;
}

ElementBase { id; name; hidden: boolean; locked: boolean; opacity: number;
              placement: { u: number; v: number; rotationDeg: number; scale: number };   // mm, see §4.3
              wrap?: boolean }                                                          // cup only
ImageElement   = ElementBase & { type: "image"; assetId; naturalWidthPx; naturalHeightPx; widthMm; heightMm; flipX; flipY }
TextElement    = ElementBase & { type: "text"; content; fontCode; sizePt; color: Hex; align: "left"|"center"|"right";
                                 bold; italic; letterSpacingEm; lineHeight; outline?: { color: Hex; widthMm } }
DrawingElement = ElementBase & { type: "drawing";
                                 strokes: { mode: "draw" | "erase"; color: Hex; sizeMm; points: [x, y, pressure][] }[] }
```

- Colours are sRGB hex. Stroke points are in mm in the drawing's local frame, simplified with RDP at 0.1 mm.
- An eraser stroke only affects its own `drawing` element (rendered offscreen, `destination-out`), never the logo or
  background below.
- Assets are referenced by `assetId`; the natural pixel size is stored so DPI can be computed offline.
- Fonts come from an FE registry `fontCode → family` (self-hosted, Vietnamese subset: Be Vietnam Pro, Montserrat,
  Roboto Slab, Playfair Display, Oswald, Dancing Script, Lobster, Pacifico), filtered by `allowedFontCodes`.
- Patterns are procedural (`dots`, `stripes`, `checker`, `waves`, `grid`, `chevron`) so they stay sharp at any DPI.
- Budget: serialized document ≤ 1 MB, ≤ 200 elements per surface. `schemaVersion` + `migrate()` for later versions.

### 4.3 Surface coordinates

Every `PrintSurface` exposes:

```ts
interface PrintSurface {
  code;
  flatBounds: RectMm; // trim box + bleed in flat (dieline) coordinates
  toFlat(u, v): { x; y; uprightRad }; // surface coords → dieline point + local "up" direction
  fromFlat(x, y): { u; v };
  clipPath(kind: "bleed" | "trim" | "safe"): PathMm;
  guides(): Guide[]; // seam, crease, safe line, trim, bleed
  uvOf(x, y): [number, number]; // dieline point → texture UV, used by the mesh builder
}
```

- **Bag faces:** `u = x`, `v = y` (mm from the trim box's top-left), upright is always 0.
- **Cup body (truncated cone):** with top radius `rt`, bottom radius `rb` and body height `H`:
  slant `L = √(H² + (rt − rb)²)`, outer radius `Rt = rt · L / (rt − rb)`, inner radius `Rb = Rt − L`,
  sweep `θ = 2π · rt / Rt`. `v` is the distance from the rim along the slant (0..L, clipped to the print band);
  `u` is the angular position written as arc length at the mid radius `Rm = (Rt + Rb) / 2` (0..θ·Rm, front of the
  cup at the centre). `toFlat` returns the point at radius `Rt − v`, angle `u / Rm − θ / 2` from the sector's
  centre line, and `uprightRad` = that angle, so an element keeps its shape (isometric) and stays upright on the cup.
  If `rt − rb < 0.5 mm` the cup is treated as a cylinder (rect surface).
- **Seam:** a radial strip of `seamMm` at one end of the sector is the glue overlap; it is shown as a guide and
  checked by preflight.
- **`wrap: true`** (cup text/image): the element is rasterised offscreen, sliced into narrow vertical strips and each
  strip is placed with `toFlat`, so wide text follows the circumference and reads horizontally on the cup.
- The mesh builder computes UVs from the same `toFlat`/`uvOf`, so 2D, 3D and print share one geometry.

## 5. Rendering

### 5.1 Compositor

`compose(surface, content, target, deps) → DrawOp[]` is pure and testable; `execute(ops, ctx2d)` is the only code
that touches a canvas. Ops: `clip`, `fillColor`, `fillPattern`, `drawImage`, `drawText`, `drawDrawing`,
`drawWarped`, `drawGuides`.

| Target      | Resolution                                                          | Notes                                                                                                  |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Editor view | `pxPerMm × zoom × devicePixelRatio`                                 | Plus a guides pass (bleed, trim, safe, seam, crease, darkened outside area) that never reaches exports |
| 3D texture  | 1024 px long side while dragging/drawing, 2048 px after 150 ms idle | One canvas per print area; only dirty surfaces recompose                                               |
| Preview     | PNG 1600 × 1600                                                     | 3D screenshot from the front; flat preview when 3D is unavailable                                      |
| Print       | `max(minDpi, 300)` DPI including bleed                              | One surface at a time to bound memory                                                                  |

- Images: `createImageBitmap`, LRU cache by bytes; a ≤ 2048 px proxy for screen/texture, the original for print.
- Text renders only after `document.fonts.load()` resolves for every used font.
- Kraft simulation: on the 3D/preview targets ink is multiplied with the kraft colour (no white ink on kraft);
  preflight warns about white/very light colours on kraft (§8).
- Wrapped elements cache their offscreen raster keyed by a content hash.

### 5.2 `ProductViewer` (three.js)

- `WebGLRenderer` with sRGB output, Neutral tone mapping (Khronos PBR Neutral, decided 2026-10-26: base colours stay at their sRGB values; ACES shifted hue and saturation), `devicePixelRatio ≤ 2`; `PerspectiveCamera`;
  `OrbitControls` with damping, clamped polar angle and zoom, no pan; `RoomEnvironment` PMREM (no HDR download);
  soft key light; contact shadow as a gradient plane.
- Mesh builders are pure functions returning `BufferGeometry` with one group per print area (testable in Node):
  - **Cup:** bottom disc, body frustum (UV from §4.3), rolled rim (torus), inner wall. Paper: `MeshStandardMaterial`
    (roughness ≈ 0.85). PET: transparent `MeshPhysicalMaterial` with the print as a decal layer.
  - **Bag:** front/back/gusset panels (UV 0..1 into each area texture), bottom, inner top fold, gusset crease,
    handles (`TubeGeometry`). Kraft fibre texture is generated procedurally once.
- Render on demand: frames only when a texture or the camera changes; paused when the tab is hidden or the viewer
  is off-screen (`IntersectionObserver`); `ResizeObserver` for size.
- API: `mount(canvas)`, `setModel(template.model)`, `setSurfaceTexture(code, canvas)`, `focusSurface(code)`
  (camera eases to the face), `pick(clientX, clientY) → { surfaceCode, u, v } | null`,
  `screenshot(opts) → Blob`, `dispose()`, events `contextlost`, `error`.
- GLB port: `GLTFLoader` + `surfaces` mapping mesh names to print areas; disabled until a template provides one.
- Fallback chain: no WebGL, context lost twice, or model build error → `FlatPreview` (composited dieline + product
  gallery photo) with "Preview 3D không khả dụng". The colour disclaimer "Màu sắc hiển thị có thể sai lệch so với
  thành phẩm in thật" is always shown with any preview (BR-07).
- Budgets: texture update ≤ 8 ms at 1024 px during interaction; frame ≤ 16 ms on a mid-range phone.

## 6. Editor UX

### 6.1 Layout

Route `/design/[id]` renders `StudioShell`: full viewport height, compact header, no footer.

```
┌ ← Thiết kế của tôi │ name ✎ │ Đã lưu 10:32 │ ↶ ↷ │ <StatusBadge> │ [primary lifecycle action] ┐
├──┬────────────┬─────────────────────────────────┬──────────────────────────────┤
│V │ active tool │ [Thân ly] | [Trước|Sau|Hông T|Hông P]  │ 3D live   ⟳ ⌖ 📷 ⛶          │
│U │ panel       │ ┌──── 2D canvas (dieline) ────┐ │ colour disclaimer            │
│T │ (280 px)    │ │ bleed · trim · safe · seam  │ ├──────────────────────────────┤
│B │             │ └─────────────────────────────┘ │ [Thuộc tính | Lớp | Kiểm tra]│
│E │             │ − 100% + │ Vừa khung │ Guide    │ workflow card + action       │
│G │             │                                 │                              │
└──┴────────────┴─────────────────────────────────┴──────────────────────────────┘
```

Desktop only (decisions 2026-10-26): `/design/new` and `/design/[id]` show a notice that design needs a computer, with
"Sao chép liên kết" and "Thiết kế của tôi", on a window below `lg` (1024 px), on a touch screen with no hover
(`(pointer: coarse) and (hover: none)`: phones and tablets at any width), and on a tablet browser by its user agent
(iPad, including iPadOS Safari that reports "Macintosh" with touch points; Android). A studio that is already open stays
mounted, hidden behind the notice, while the window is too narrow, so narrowing a desktop window loses no edit. The
phone layout (2D/3D switch, bottom tool bar, sheets) was removed. Touch input stays for touch laptops: pinch zooms/pans
the stage; with the brush tool one finger draws.

### 6.2 Tools

| Tool (key)       | Behaviour                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chọn (V)         | Select by canvas hit-test, Layers list, or clicking the 3D model. SVG handles: move, scale (ratio kept, Shift free), rotate (Shift snaps 15°). On the cup handles follow the local upright frame. Snap to surface centre, safe edges and other elements' centres. Arrows nudge 0.5 mm, Shift + arrows 5 mm                      |
| Ảnh/Logo (U)     | Drop, paste or pick a file; checked against `allowedFileFormats` / `maxFileSizeMb`. SVG is rasterised client-side at print resolution and never uploaded as SVG. PDF logos are out of scope. Live DPI badge ("212 DPI ✓" / "96 DPI – sẽ mờ"). Flip, opacity, "Vừa vùng an toàn", "Uốn theo thân ly" (cup)                       |
| Chữ (T)          | Double-click/Enter edits inline through a textarea overlay matched to the element's transform; Escape leaves editing and keeps the text. Font (combobox with preview, allowed fonts only), size (pt), colour (brand presets + recent + hex), align, bold/italic, outline, letter spacing, line height, "Uốn theo thân ly" (cup) |
| Vẽ (B) / Tẩy (E) | Size (mm), colour, opacity; pen pressure when available (`perfect-freehand`). Strokes go to the selected `drawing` element or a new "Nét vẽ n"                                                                                                                                                                                  |
| Nền (G)          | None / colour / pattern (two colours, scale, rotation); bag: "Áp dụng cho mọi mặt"                                                                                                                                                                                                                                              |

Commands: duplicate (Ctrl+D), delete (Delete), raise/lower (Ctrl+] / Ctrl+[), centre H/V, lock, hide,
"Sao chép sang mặt khác" (bag), undo (Ctrl+Z), redo (Ctrl+Shift+Z / Ctrl+Y). History keeps 100 steps; one drag
or one stroke is one step. Shortcuts are active only while focus is inside the stage, never inside inputs.

### 6.3 Read-only mode

When the design is not editable (§7.5) tools are disabled and a banner explains why with the next action
("Rút yêu cầu để chỉnh sửa", "Tạo phiên bản mới").

### 6.4 Accessibility

- The canvas has `role="img"` with a summary label; the Layers panel is the accessible view of the canvas
  (listbox: arrows select, Enter edits, Delete removes).
- Every icon button has a Vietnamese label and a tooltip with its shortcut; visible `focus-visible` rings in light
  and dark mode; a polite live region announces "Đã thêm ảnh", "Đã lưu", preflight changes.
- `beforeunload` guard while changes are unsaved.
- Tokens only (Ink + Blue, `--r-lg`, `--sh-sm`, `--card-pad`); no raw hex in components — document colours are
  data rendered on the canvas, not styling.

## 7. Data layer and API

### 7.1 Existing endpoints used as they are

All endpoints of §2.2. `PUT /specification` carries a human-readable summary (≤ 4000 chars) for Sales/QC:
template, SKU, element counts per surface, fonts, colours, preflight result, document SHA-256.

### 7.2 Proposed endpoints (mock first, then a BE change request)

| #   | Endpoint                                                                                                                                           | Request → Response                                                                                                                                                                                                                           | Errors                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| P1  | `POST /designs/mine`                                                                                                                               | `{productId, sku, templateCode, name}` → `DesignDraftResponse`; owner = caller, `customerId` from the caller's profile, reviewer assigned by the BE from the QC pool                                                                         | 404 `PRODUCT_NOT_FOUND`, 409 `PRODUCT_NOT_CUSTOMIZABLE`, 422 `TEMPLATE_NOT_FOUND` |
| P2  | `GET /catalog/products/{slug}/customization`                                                                                                       | → `{productId, kind, templates: CustomizationTemplate[]}`; plus `kind` on `CatalogProductResponse` and `CatalogCardResponse`                                                                                                                 | 404, 409 `PRODUCT_NOT_CUSTOMIZABLE`                                               |
| P3  | `GET / PUT /designs/{id}/document`                                                                                                                 | GET → `{designId, version, document, checksum, updatedAt}`; PUT `{version, document}` → same. Shares the draft's `version`; a PUT resets the technical review like `revise`; the confirmation snapshot freezes the document and its checksum | 409 `CONFLICT` (version), 413 (> 1 MB), 400 `VALIDATION_FAILED` (schema)          |
| P4  | `POST /designs/{id}/assets` (multipart `file`, `Idempotency-Key`) · `GET /designs/{id}/assets` · `GET /designs/{id}/assets/{assetId}/download-url` | → `{assetId, designId, originalName, contentType, widthPx, heightPx, sizeBytes, checksum, storedAt}`; download → `{url, expiresAt}`. Private; frozen with the snapshot (BR-03)                                                               | 413, 415, ClamAV rejection                                                        |
| P5  | `POST /designs/{id}/technical-review-requests` `{version}`                                                                                         | → `DesignDraftResponse` with `reviewRequestedAt`                                                                                                                                                                                             | 409 when there is no current artifact or the design is not DRAFT                  |
| P6  | `DesignDraftResponse` additions                                                                                                                    | `sku, templateCode, reviewRequestedAt, reviewedAt, updatedAt, previewArtifactId`; plus a `status` filter on `GET /designs`                                                                                                                   | —                                                                                 |
| G11 | `customization_templates.model_params_json`                                                                                                        | Parametric model parameters for P2                                                                                                                                                                                                           | —                                                                                 |

During M3 these rows become a standalone BE change request (`docs/superpowers/specs/2026-10-25-design-api-be-proposal.md`).

### 7.3 Mock implementation

- `src/lib/api/mock-fixtures/designs.ts` — in-memory store: drafts, documents, assets (Blob + object URL),
  artifacts, history, snapshots; customization templates for the seeded cups and bag.
- `src/lib/api/mock-design.ts` — registers P1–P6 and every §2.2 route with the BE's rules: version check → 409,
  owner/state checks, review reset on document/artifact changes, immutable snapshot on confirmation.
- Mock-only behaviour, labelled in code: after P5 the mock marks the technical review passed after ~2 s so a demo can
  go end to end (the FE already blocks P5 when preflight has a Fail).
- Real BE: a 404/405 from P1–P5 maps to `DESIGN_API_UNAVAILABLE` in `errors.ts`; the UI shows
  "Tính năng này đang chờ backend hỗ trợ" with what still works (list, history, workflow on Sales-created designs).

### 7.4 React Query

- `designKeys`: `all`, `lists()`, `list(params)`, `details()`, `detail(id)`, `document(id)`, `assets(id)`,
  `artifacts(id)`, `history(id)`, `snapshot(id)`, `customization(slug)`.
- Responses are parsed once in `api.ts` with zod (`DesignDraftDto`, `DesignDocumentDto`, `DesignAssetDto`,
  `CustomizationDto`, …); a parse failure is a contract bug shown by `error.tsx`.

| Mutation                                                       | Invalidates / updates                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------- |
| create (P1)                                                    | `lists()`; navigate to the studio                             |
| saveDocument (P3)                                              | `setQueryData(document(id))`, `detail(id)` version; `lists()` |
| uploadAsset (P4)                                               | `assets(id)`                                                  |
| requestReview (artifacts + spec + P5)                          | `detail(id)`, `artifacts(id)`, `history(id)`                  |
| finalize (submit → confirm), confirm, requestChanges, withdraw | `detail(id)`, `lists()`, `history(id)`, `snapshot(id)`        |
| fork                                                           | `lists()`; navigate to the new draft                          |

Autosave: debounce 1.5 s after the last change and flush on `visibilitychange`/route leave; one request in flight,
later changes queue. On 409 autosave stops and a dialog "Thiết kế đã thay đổi ở nơi khác" offers reload or
downloading the local document as a JSON backup. Offline: the header save state reads "Mất kết nối – sẽ lưu khi có mạng"; the queued save is retried with backoff.

### 7.5 Lifecycle (derived from BE fields in `lifecycle.ts`)

| UI state                                  | BE condition                                                  | Customer actions                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `editing` — Đang thiết kế                 | DRAFT, no `reviewRequestedAt` after the last document change  | edit, autosave, "Gửi QC kiểm tra" (blocked when preflight has a Fail — BR-01, BR-DSG-001)                             |
| `awaitingReview` — Chờ QC kiểm tra        | DRAFT, `reviewRequestedAt` ≥ `updatedAt`, no review yet       | view; editing warns it cancels the request                                                                            |
| `changesRequested` — QC yêu cầu sửa       | DRAFT, `technicalReviewPassed = false`, `reviewNotes` present | edit with the QC notes shown, request review again                                                                    |
| `reviewPassed` — Đạt kỹ thuật             | DRAFT, `technicalReviewPassed = true`                         | "Chốt thiết kế" = submit then confirm (risk checkbox when preflight has Warnings); editing warns it resets the review |
| `awaitingConfirmation` — Chờ bạn xác nhận | SUBMITTED (sent by Sales)                                     | confirm, request changes (reason), withdraw                                                                           |
| `confirmed` — Đã chốt                     | APPROVED with snapshot                                        | view snapshot, snapshot id with "Sao chép mã", "Yêu cầu báo giá" (opens chat with Sales), "Tạo phiên bản mới" (fork)  |

States are evaluated in this order and the first match wins: `confirmed` → `awaitingConfirmation` →
`reviewPassed` → `changesRequested` → `awaitingReview` → `editing`. A customer change request (SUBMITTED → DRAFT)
also leaves `reviewNotes` set, so it shows as `changesRequested` with the customer's own reason.
Without P6 fields (real BE) `awaitingReview` falls back to: DRAFT, `currentArtifactId` set, no review notes, not
passed. Status text goes through a feature-local `DesignStatusBadge` built like `features/order/components/order-status-badge.tsx` (label + tone from `lifecycle.ts`).
There is no "Thêm vào giỏ": confirmed designs continue through quote → sample → order with Sales.

### 7.6 Routes and entry points

- PDP: "Bắt đầu thiết kế" only when `kind = CUSTOMIZABLE`; links to `/design/new?product={slug}&sku={sku}`.
- `/design/new` (new static segment): loads P2, picks the template of the SKU (asks only when the variant has
  several), default name "{product} – {dd/MM}", calls P1, `router.replace('/design/{id}')`.
- `/design`: cards with the preview thumbnail (download link cached until `expiresAt`), status badge, product,
  updated time; status tab and page in the URL via `nuqs` (changing the tab resets the page); separate empty
  states for "no designs yet" (link to customizable products) and "no design in this tab".
- `/design/[id]`: the studio, with `loading.tsx`, `error.tsx` and not-found handling.
- The in-file mock in `api.ts`, the old schemas/lifecycle and `design-editor.tsx` / `element-panel.tsx` /
  `variant-recheck.tsx` are replaced. `components/storefront/design-canvas.tsx` and `canvas-toolbar.tsx` are
  removed or rewritten if nothing else uses them.

## 8. Preflight

Pure `runPreflight(document, template, assets) → PreflightReport`, re-run 300 ms after changes. Advisory only — the
BE QC review remains the gate. Each issue carries `surfaceCode` and `elementId` for click-to-locate.

| Level   | Rule id              | Condition                                                                       | Source                       |
| ------- | -------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| Fail    | `OUTSIDE_PRINT_AREA` | element extends past the bleed edge or lies completely outside the trim box     | BR-02                        |
| Fail    | `DPI_BELOW_MIN`      | effective DPI (`naturalPx / (placedMm / 25.4)`) < `minDpi`                      | BR-DSG-001 (ASSUMPTION §2.4) |
| Fail    | `FONT_NOT_ALLOWED`   | `fontCode` not in `allowedFontCodes` or failed to load                          | BR-DSG-001                   |
| Fail    | `ASSET_INVALID`      | asset format/size outside the template, or asset cannot be loaded               | BR-06                        |
| Fail    | `EMPTY_DESIGN`       | no visible element and no background on any surface                             | —                            |
| Warning | `CROSSES_SAFE_AREA`  | element (not background) enters the band between safe line and trim             | docs 12 §4 step 4            |
| Warning | `DPI_LOW`            | `minDpi` ≤ DPI < `max(minDpi, 300)` (the print file's DPI)                      | docs 12 edge case            |
| Warning | `ON_SEAM`            | element intersects the cup seam strip                                           | —                            |
| Warning | `TOO_THIN`           | stroke/outline < 0.25 mm or text < 6 pt                                         | —                            |
| Warning | `WHITE_ON_KRAFT`     | white/near-white colour on a kraft material                                     | —                            |
| Warning | `TOO_MANY_COLORS`    | distinct solid colours > `maxColors`, or images present when `maxColors` is set | docs 12 §3                   |
| Info    | `CMYK_CONVERSION`    | `colorMode = CMYK`: colours will look duller in print                           | BR-07                        |

Result = highest level present (`Pass` / `Warning` / `Fail`).

## 9. Export (on "Gửi QC kiểm tra")

1. `CUSTOMER_PREVIEW`: PNG 1600 × 1600 from `ProductViewer.screenshot` at the front angle (flat preview fallback).
2. `PRINT_READY`: PDF via `pdf-lib`, one page per print area, page = bleed box in mm (pt = mm × 72 / 25.4), raster at
   `max(minDpi, 300)` DPI, cut path drawn as a vector in a `CutContour` spot colour (sector outline for the cup), overprinting (decided 2026-10-26: no hairline knocked out of the artwork; the print partner confirms names and stroke width). Pages too large for one canvas are drawn in bands that overlap the next by one row.
   RGB only — CMYK conversion is prepress/BE work (G8).
3. `TECHNICAL_SPEC`: PDF summary — template, SKU, area sizes, fonts, colours, preflight report, document SHA-256.
4. Then `PUT /specification` (summary) and P5. Uploads use `Idempotency-Key` so a retried request does not
   duplicate artifacts. A progress dialog shows each step; a failed step can be retried without redoing earlier ones.

## 10. Errors and fallbacks

| Situation                                                    | Behaviour                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Upload rejected (413, 415, ClamAV, template limits, > 40 MP) | Vietnamese message naming the limit; nothing is added to the document                           |
| Asset URL expired                                            | Request a new `download-url` once; on failure a "Không tải được ảnh" tile + `ASSET_INVALID`     |
| Font fails to load                                           | Fallback font in the editor with a Warning; export blocked by `FONT_NOT_ALLOWED`                |
| WebGL missing / context lost twice / model error             | `FlatPreview` + "Preview 3D không khả dụng"                                                     |
| 409 on save or workflow                                      | Autosave stops; conflict dialog (reload / download JSON)                                        |
| Offline                                                      | Header save state "Mất kết nối – sẽ lưu khi có mạng"; queued autosave with backoff; leave guard |
| Proposed endpoint missing on real BE                         | `DESIGN_API_UNAVAILABLE` state with what still works                                            |
| zod parse failure                                            | Contract-bug error in `error.tsx` with a retry                                                  |

## 11. Testing

- Unit (Vitest, ≥ 90 % on `engine/**` pure modules, `schemas.ts`, `lifecycle.ts`, `selectors.ts`):
  cup sector maths against hand-computed values and `toFlat`/`fromFlat` round trips; bag faces; commands and
  history (undo/redo, gesture coalescing); compositor `DrawOp` output for fixtures; each preflight rule (removing a
  rule fails a test); lifecycle table for every BE state; zod contract tests on BE-shaped fixtures; mesh builders
  (vertex/group counts, every UV in [0, 1]).
- Component (RTL + `userEvent`): Layers keyboard behaviour, Properties forms, PreflightPanel click-to-locate,
  WorkflowBar per lifecycle state, viewer fallback (jsdom has no WebGL).
- Feature (RTL + MSW): PDP → new → studio; autosave + 409 dialog; asset upload; request review → finalize →
  snapshot → fork; real-mode 404 → unavailable state.
- Browser preview for 3D rendering, drag/rotate/brush, mobile 375 px and dark mode; no E2E runner yet.

## 12. Milestones

| #   | Milestone                                                                                                               | Done when                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| M1  | Engine core: document, commands/history, cup and bag surfaces, compositor + guides, preflight                           | unit tests green, no UI                                |
| M2  | `ProductViewer`: meshes, materials, texture binding, pick, fallback                                                     | geometry tests green; renders in a dev page            |
| M3  | Data layer: DTO + proposed schemas, `api.ts`, mock fixtures/routes, queries/mutations, lifecycle; BE change request doc | MSW/contract tests green                               |
| M4  | Studio UI: shell, stage + overlay, five tools, Layers/Properties, undo/redo, mobile sheets                              | component tests green; browser check                   |
| M5  | Workflow + export: preflight panel, PNG/PDF, review/finalize/fork, design list, PDP entry                               | feature tests green; mock flow end to end              |
| M6  | A11y, performance and browser verification pass                                                                         | `pnpm run validate` green; success criteria §1 checked |

## 13. Open questions

1. Low-DPI policy (§2.4): Fail below `minDpi` and Warning below `max(minDpi, 300)` — applied 2026-10-26, BA/lead to confirm.
2. Who sends the confirmation request: the customer (self-service "Chốt thiết kế") or Sales only? This spec lets the
   owner do both steps, which the BE already allows.
3. Asset scope: per design (this spec) or a customer-level logo library reused across designs.
4. PET clear cups: white underbase for ink on clear plastic is not modelled; preview shows ink as opaque.
5. Where CMYK conversion and colour profiles live (prepress tool, BE job) — out of FE scope.
6. Chat context for "Yêu cầu báo giá": the chat module must accept a design snapshot id; until then the button
   opens the chat page and the confirmed card offers the snapshot id with a "Sao chép mã" button (the chat has no prefill yet).

## 14. Out of scope (v1)

Boxes and sleeves; shapes/clipart; multi-select; GLB models (port only); price by print parameters (BR-05);
CMYK conversion; automated content moderation (open question B6); live co-editing with Sales; server-side static
render fallback; PDF logo import; background removal.
