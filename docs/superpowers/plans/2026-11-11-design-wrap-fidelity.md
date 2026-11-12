# Wrapped elements that print as they are seen — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use
> checkbox (`- [ ]`) syntax.

**Goal:** wrapped images are remapped exactly onto the cup sector (no tears) and wrapped text is
drawn as vector glyphs along the arc (no blur), identically on the stage, the 3D texture and the
print file.

**Architecture:** a closed-form polar warp (`PolarWarp`) owned by the geometry layer; a pure
premultiplied-bilinear remap over RGBA arrays; `compose` emits `warpedImage` / `arcText` ops in
place of strips; the executor draws them (print exact on the flat pixel grid, screen cached and
rotated about the apex).

**Tech stack:** TypeScript strict, Canvas 2D, Vitest (jsdom, no real canvas: pure functions and
recording fakes).

**Spec:** `docs/superpowers/specs/2026-11-11-design-wrap-fidelity.md`.

## Global constraints

- Everything in `C:\Users\Admin\AppData\Local\Temp\claude\cba0d09a384376c8\37887db6-2209-4b32-a11e-d3333975e92c\scratchpad\deferred\constraints.md`
  applies (pnpm only, never `git stash` / `git add` / commit, no formatter on whole directories,
  no `any` / `@ts-ignore` / `eslint-disable`, no subagents, TDD).
- No new dependencies. No WebGL. Engine code stays DOM-free (the executor reaches the canvas only
  through `Ctx2D` / `RenderEnv`).
- Geometry is the spec's §4 formula; the surface stays the only owner of its unrolling
  (`toFlat` / `fromFlat`).

## Review focus

1. A wrapped image partly outside the bleed, or spanning two print bands: bands join without a seam.
2. A translucent wrapped image (opacity < 1): uniform, no darker lines.
3. A flipped wrapped image (flipX / flipY): mirrored exactly as before the change.
4. An image not decoded yet (placeholder), then decoded; an image replaced (new `assetId`).
5. Wrapped text with outline, letter spacing, Vietnamese stacked diacritics, several lines, each
   alignment.

---

### Task 1: Polar warp geometry

**Files:** create `engine/geometry/polar-warp.ts` + `engine/__tests__/polar-warp.test.ts`; modify
`engine/surfaces/types.ts`, `engine/surfaces/cup.ts` (sector surfaces expose `apexMm: PointMm`),
`engine/index.ts`.

**Produces:**
- `type PolarWarp = { apex: PointMm; radiusMm: number; angleRad: number; scale: number; flipX: boolean; flipY: boolean; box: RectMm }`
- `polarWarp(el: DesignElement, surface: PrintSurface, box: RectMm): PolarWarp | undefined` —
  `undefined` unless `isWrapped(el, surface)`.
- `warpToFlat(w: PolarWarp, x: number, y: number): PointMm` and
  `warpToLocal(w: PolarWarp, px: number, py: number): PointMm` (spec §4; the inverse may return
  points outside `box`).
- `warpStretch(w: PolarWarp): number` — the largest `r / R_el` over the box (≥ 1).
- `warpBounds(w: PolarWarp): RectMm` — flat bounding box of the warped box (both arcs sampled,
  plus the axis angles inside the range, like `bleedBox`).

- [ ] Tests first:
  - for 9 columns `xc` across the box and `y` ∈ {top, 0, bottom}:
    `applyToPoint(wrapStripMatrix(el.placement, surface, xc, flip), {x: xc, y})` equals
    `warpToFlat(w, xc, y)` within 1e-9 (unflipped, flipX, flipY);
  - `warpToLocal(w, ...warpToFlat(w, x, y))` returns `(x, y)` within 1e-9;
  - `warpBounds` contains every point of `elementOutline(el, surface, box)`;
  - `warpStretch` of a full-height 97 mm image on `cup12oz` at mid radius is `(R_el + 48.5) / R_el`;
  - `polarWarp` is `undefined` for a drawing, an unwrapped element and a rect surface.
- [ ] Implement; `pnpm exec vitest run src/features/product-design/engine` green.

### Task 2: Remap core

**Files:** create `engine/render/remap.ts` + `engine/__tests__/remap.test.ts`.

**Produces:**
- `type Raster = { data: Uint8ClampedArray; width: number; height: number }` (RGBA, unpremultiplied
  like `ImageData`).
- `remapRaster(src: Raster, srcFrame: { x: number; y: number; pxPerMm: number }, dst: { width: number; height: number }, toLocal: (px: number, py: number) => PointMm): Raster`
  — for each destination pixel centre `(px + 0.5, py + 0.5)`, `toLocal` gives local mm; the source
  is sampled at `((x − srcFrame.x) · k − 0.5, (y − srcFrame.y) · k − 0.5)` with **premultiplied
  bilinear** interpolation; neighbours outside the source count as transparent (so edges are
  anti-aliased, never stretched).

- [ ] Tests first (synthetic rasters, no canvas):
  - an identity `toLocal` at the source's own resolution copies the raster byte for byte;
  - premultiplied: halfway between an opaque red pixel and a transparent black one gives
    `rgb (255, 0, 0)`, alpha ≈ 128 (not a dark fringe);
  - **no gaps:** a solid opaque source remapped through `warpToLocal` of a full-height `cup12oz`
    image at 12 px/mm — every destination pixel whose centre maps inside the box by ≥ 1 source px
    is fully opaque, every one mapping outside by ≥ 1 px is fully transparent;
  - a flipX warp mirrors a two-colour source.
- [ ] Implement; tests green.

### Task 3: Images through the remap

**Files:** modify `engine/render/ops.ts` (`{ op: "warpedImage"; source: ImageOp; warp: PolarWarp }`;
the `warped` op stays for text until Task 5), `engine/render/compose.ts` (images only),
`engine/render/execute.ts` (`Ctx2D` gains `getImageData`, `putImageData`; `RenderEnv` gains
`exactWarp?: boolean`), create `engine/render/warped-image.ts`, modify
`components/studio/export-renderer.ts` (print env `exactWarp: true`); tests in
`engine/__tests__/compose.test.ts`, `engine/__tests__/execute.test.ts` (or a new
`warped-image.test.ts`).

**Behaviour (spec §5.1):**
- Source raster at `k_src = min(pxPerMm · s · warpStretch(w), native px per local mm)`, capped by
  `MAX_LAYER_EDGE_PX`, painted with `imageSmoothingQuality = "high"`; cached by asset, box and
  `k_src`.
- **Exact** (`env.exactWarp`): destination = `warpBounds` snapped outward to the flat pixel grid at
  `pxPerMm`; `toLocal` = `warpToLocal` of each pixel centre; drawn at the snapped rect so one
  destination pixel is one output pixel.
- **Screen:** the same with `angleRad = 0`, cached by (asset, box, `radiusMm`, scale, flips,
  `pxPerMm`), drawn with `translate(apex) · rotate(angleRad) · translate(−apex)`.
- Drawn once with `globalAlpha = opacity`. Not decoded → the placeholder colour remapped from a
  solid source (same region, no strips).

- [ ] Tests first:
  - `compose` emits `warpedImage` with `warp` equal to `polarWarp(el, surface, sizer(el))` for a
    wrapped image, a plain `image` op otherwise;
  - with a recording fake env whose layers hold real `Uint8ClampedArray` pixels: one `drawImage`
    of the destination layer per element, `globalAlpha` = opacity, no `fillRect` strips;
  - screen: two executes with only `u` changed create the destination layer once (cache) and draw
    it rotated by the new angle; exact: the second execute recomputes and draws with no rotation,
    at integer pixel coordinates;
  - a new `assetId` invalidates the cached layers.
- [ ] Implement; `pnpm exec vitest run src/features/product-design` green.

### Task 4: DPI that counts the warp stretch

**Files:** modify `engine/preflight/rules/resolution.ts`
(`placedDpi(el: ImageElement, surface?: PrintSurface): number` — divides the horizontal DPI by
`warpStretch` when the image is wrapped on that surface), the rule that calls it,
`components/studio/dpi-badge.tsx` (passes the active surface); tests in
`engine/__tests__/preflight.test.ts` and the dpi-badge / image-tool tests.

- [ ] Tests first: a wrapped full-height image on `cup12oz` reports `placed / stretch` on the
  horizontal axis (and preflight fails it when that drops below `minDpi` while the unwrapped one
  passes); an unwrapped image and any image on a bag are unchanged; the badge shows the same number
  preflight uses.
- [ ] Implement; tests green.

### Task 5: Text as vector glyphs along the arc

**Files:** create `engine/render/arc-text.ts`; modify `engine/render/ops.ts`
(`{ op: "arcText"; source: TextOp; glyphs: ArcGlyph[] }`; **remove** `warped`, `Strip`,
`WarpableOp` if unused), `engine/render/compose.ts`, `engine/render/execute.ts`; **delete**
`engine/render/warp.ts`, `engine/render/warped.ts` (move `layerPx` / `rasterScale` /
`MAX_LAYER_EDGE_PX` to where their remaining users need them); update `engine/index.ts`, every test
that used strips, and the wrap paragraph of `docs/superpowers/specs/2026-11-09-design-module12-a-foundation-design.md`.

**Produces:**
- `type ArcGlyph = { text: string; xMm: number; baselineMm: number; matrix: Mat2D }`
- `arcGlyphs(el: TextElement, layout: TextLayout, surface: PrintSurface, fonts: FontRegistry, measure: TextMeasurer): ArcGlyph[]`
  — graphemes by `Intl.Segmenter(undefined, { granularity: "grapheme" })`; for grapheme `i` of a
  line, `xMm = line.xMm + measure(prefix_i) · mmPerPx + codePoints(prefix_i) · letterSpacingMm`
  (the same sum `layoutText` uses, so the last glyph ends at `line.xMm + line.widthMm`); `matrix =
  wrapStripMatrix(el.placement, surface, centre_i)` with `centre_i` the grapheme's middle.
- Executor: font `fontCss(layout, fontSizeMm)`, `letterSpacing` `"0px"`, every glyph's
  `strokeText` (outline width × 2, round joins, as `paintText`) before any `fillText`, each under
  its own matrix, `globalAlpha = opacity`. No layer, no `drawImage`.

- [ ] Tests first:
  - with an additive fake measurer the last glyph ends at `line.xMm + line.widthMm`; with a
    kerning fake (`measure("AV") < measure("A") + measure("V")`) the "V" starts at
    `measure("A")`;
  - `"e\u0323\u0302"` is one glyph; an empty line yields none; two lines sit at their own
    baselines;
  - every glyph's matrix equals `wrapStripMatrix` at its centre, so its centre lies on radius
    `R_el − baseline · s`;
  - the executor strokes every glyph before filling any, and never calls `createLayer` or
    `drawImage` for text.
- [ ] Implement; remove the strip code; `pnpm run typecheck`, `pnpm run lint`,
  `pnpm exec vitest run src/features/product-design` green.

### After the tasks (controller)

Whole-branch review (most capable model) → one fix wave → `pnpm run validate` → browser check:
the 12oz cup with a full-height photo and a "hello" text wrapped — stage zoomed in (no seams, sharp
text), 3D view, then a submission whose PRINT_READY PDF is opened and inspected at 300 dpi.
