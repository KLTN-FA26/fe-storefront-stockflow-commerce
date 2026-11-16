# Module 12 — wrapped elements that print as they are seen (design)

Date: 2026-11-11. Branch: `feat/design-m12-a-foundation`. Extends spec
`2026-11-09-design-module12-a-foundation-design.md` (§4.3 cup unrolling, engine rule R15).

## 1. Problem

A wrapped (`wrap: true`) text or image on the cup is drawn today as 48 rigid strips
(`render/warp.ts`, `render/warped.ts`). Each strip is a straight rectangle turned to its own
upright, so it fits the annular sector only along the element's centre radius:

- **Images tear.** Neighbouring strips leave a wedge gap above the centre radius and overlap
  below it. Measured on the 12oz cup with a full-height image (221 × 97 mm): 0.80 mm at the outer
  edge, 0.80 mm overlap at the inner edge — about 9 px of white gap at 300 dpi, in the **print
  file** as well as on screen and on the 3D model (which samples the same flat render).
- **Text blurs.** Wrapped text is first painted into a raster layer at screen resolution, then
  resampled through 48 rotated strips: anti-aliased twice plus bilinear interpolation.

## 2. Goal

What the customer sees in 2D and 3D is what prints and what the formed cup shows. One geometry
(the cone unrolling the surface already owns: `toFlat` / `fromFlat`), one renderer (`compose` +
`execute`, shared by the stage, the 3D texture and the print bands); only the resolution differs.

## 3. Decisions (agreed 2026-11-11)

| Topic       | Decision                                                                                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Images      | **A — exact polar remap.** Every destination pixel is mapped back to the element's local frame and sampled once. No strips.                                                             |
| Text        | **T1 — vector glyphs along the arc.** Each grapheme is drawn by the canvas font engine (`fillText`) at its own position and angle on the arc; glyphs are rigid, never rasterised first. |
| Tall text   | Not in this change (a later option: route text taller than ~25–30 mm through A).                                                                                                        |
| GPU (WebGL) | Not used: the print file is built in the customer's browser and must be the same on every machine. The remap formula stays a pure function so a screen-only shader can be added later.  |
| Print PDF   | Stays a raster at `printDpi(minDpi)` with the CutContour vector; vector text in the PDF is a later phase.                                                                               |

## 4. Geometry

For a wrapped element at placement `(u, v, scale s, flipX, flipY)` on a sector surface with apex
`O`, let `R_el` be the radius at `v` and `φ_el` the angle at `u` (the element's centre; `toFlat`).
Local mm `(x, y)` of the element (box centred on the origin, y down) map to the flat sheet as

    φ = φ_el + (x' · s) / R_el        r = R_el − y' · s        P = O + r · (sin φ, −cos φ)

with `x' = flipX ? −x : x`, `y' = flipY ? −y : y`. So `x` mm of the element always cover the same
arc length at the element's centre radius (as `arcOffsetU` does today) and the element stretches
by `r / R_el` away from that radius — exactly what makes it read straight on the formed cup. The
inverse (flat → local) is closed-form: `r = |P − O|`, `φ = atan2`, then `x`, `y`.

Implications:

- The selection outline, hit-test and preflight area checks already sample this mapping
  (`elementOutline`); they do not change.
- **Resolution:** horizontally the element is stretched by up to `(R_el + s·h/2) / R_el` at its
  outer edge (≈ 1.17 for a full-height image on the 12oz cup). The DPI shown in the image tool and
  checked by preflight (`placedDpi`) must divide by that factor for a wrapped image, or the screen
  says "ok" while the print is softer than the minimum.

## 5. Rendering

### 5.1 Images (A)

- `compose` emits `{ op: "warpedImage", source, warp }` where `warp` is plain data (apex, `R_el`,
  `φ_el`, `s`, flips, the local box).
- The executor rasterises the source once at `k_src` px per local mm — enough for the most
  stretched column (`pxPerMm · s · maxStretch`), capped at the image's own resolution and the layer
  edge limit — then remaps it onto a destination raster with **premultiplied bilinear** sampling
  (no dark fringe at transparent edges; out-of-box pixels transparent), and draws that raster once
  with the element's opacity (no strip overlap, so no group composite is needed).
- **Print** (`env.exactWarp`, set by the export renderer): the destination raster is laid on the
  flat pixel grid at `pxPerMm` and drawn pixel-aligned. The full-resolution original is rasterised
  once at `k_src` (capped at its own resolution, so a photo finer than that is scaled down first),
  and that raster is remapped once. Bands of a tall page each remap only their part, on the same
  grid.
- **Stage and 3D texture**: the destination raster is computed at `φ_el = 0` and drawn rotated
  about the apex by `φ_el`, cached by content, `v`, scale, flips and resolution — moving along the
  arc does not recompute. Geometry is identical to print; only the sub-pixel resampling differs.
  The source raster's sides are rounded up to steps of √2 px (capped at the image's own size). A
  kept source is found by its picture and size in any of its element's slots, so a scale drag or a
  zoom reuses it until a side crosses a step; a zoom keeps one more source slot per element and no
  destination at the resolutions it passes.
- An image not decoded yet is drawn as the placeholder colour over the same warped region.

### 5.2 Text (T1)

- `compose` emits `{ op: "arcText", source, glyphs }`: for every grapheme of every line
  (`Intl.Segmenter`, so "ệ" written as `e` + two combining marks stays one glyph) its text, its
  local `x` and baseline, and the matrix that places it at its own angle on the arc
  (`wrapColumnMatrix` at the grapheme's centre).
- A grapheme `g` after the line prefix `p` starts at `measure(p + g) − measure(g)`, which includes
  the kern between `g` and the glyph before it, plus the letter spacing per grapheme; `layoutText`
  counts letter-spacing gaps per grapheme as well. So the last glyph ends exactly at the line's
  laid-out end and the bent text keeps the spacing of the same text unbent.
- The executor draws all outlines, then all fills, glyph by glyph with `strokeText` / `fillText` at
  the output resolution — no resample. Opaque text goes straight onto the context; translucent
  text is drawn at full alpha into one layer on the output pixel grid and composited once at its
  opacity (so overlapping outlines do not darken), one layer pixel per output pixel. The print
  band draws them at ≥ 300 dpi the same way.

### 5.3 Removed

`Strip`, `warpStrips`, `WARP_STRIP_COUNT`, `drawWarped` and the strip layer cache go.

## 6. Out of scope

Tall-text routing through A; vector text in the PDF; CMYK/ICC soft-proofing; per-process minimum
text and line sizes (all need the print house's requirements first).
