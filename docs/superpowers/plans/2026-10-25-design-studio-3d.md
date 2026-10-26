# Design Studio 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock design page with a production design studio for paper/PET cups and kraft bags: a framework-agnostic engine (mm document, cup annular-sector geometry, one compositor, preflight, export), a plain three.js live preview, and a data layer written against the BE plus the proposed endpoints served by the mock adapter.

**Architecture:** `src/features/product-design/engine/**` is plain TypeScript (no React/Next/axios/lib-api imports) and owns geometry, rendering, preflight, history and export. Thin React components in `components/studio/**` host the engine's canvases and the `ProductViewer`. The feature data layer (`api.ts`, `schemas.ts`, `queries.ts`, `mutations.ts`, `lifecycle.ts`, `autosave.ts`) talks to `/designs/**` through `@/lib/api/client`; `USE_MOCK=true` serves both real and proposed endpoints from `src/lib/api/mock-fixtures/designs.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, zod 4, TanStack Query 5, zustand 5 (`zustand/vanilla`), nuqs, shadcn/Radix, three.js, perfect-freehand, pdf-lib, Vitest + RTL + `userEvent`.

**Spec:** `docs/superpowers/specs/2026-10-25-design-studio-3d-design.md` — read it first; section numbers below (§n) refer to it.

## Global Constraints

- `pnpm` only. Add dependencies with `pnpm add three perfect-freehand pdf-lib` and `pnpm add -D @types/three` in the task that first needs them.
- Never read or edit `.env*`; never edit `src/_design/*RULES.md` or `components/ui/*` styling. New shadcn primitives (`tabs`, `slider`, `toggle-group`) are added with `pnpm dlx shadcn@latest add <name>` and left unmodified.
- `src/features/product-design/engine/**` must not import from `react`, `next/*`, `@/components/**`, `@/lib/api/**`, or `../components/**`. Components import the engine only through `engine/index.ts`. The data layer (`schemas.ts`, `api.ts`) imports the specific schema modules (`engine/template/schema`, `engine/document/schema`, `engine/document/factory`) so three.js never enters the design list or catalog bundles.
- Only `src/lib/api/mock-adapter.ts` imports `src/lib/mock-data.ts`. `src/lib/**` never imports `src/features/**`.
- No raw hex or px in `className`/`style` for UI chrome. Hex literals are allowed only as **print data** (document colours, palette in `engine/document/palette.ts`, fixtures, tests); a swatch renders its data colour with `style={{ backgroundColor: color }}`.
- Units: document and geometry in **mm**; font size in **pt** (`mm = pt × 25.4 / 72`); PDF pages in pt (`pt = mm × 72 / 25.4`); DPI = `naturalPx / (placedMm / 25.4)`.
- Limits: `MAX_ELEMENTS_PER_SURFACE = 200`, `MAX_DOCUMENT_BYTES = 1_000_000`, history 100 steps, autosave debounce 1500 ms, preflight debounce 300 ms, texture 1024 px while interacting → 2048 px after 150 ms idle, print raster `max(minDpi, 300)` DPI, preview PNG 1600 × 1600, images > 40 MP rejected, screen proxy ≤ 2048 px.
- Fixed copy (Vietnamese, exact): colour disclaimer "Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật"; fallback label "Preview 3D không khả dụng"; unavailable state "Tính năng này đang chờ backend hỗ trợ"; conflict title "Thiết kế đã thay đổi ở nơi khác"; save states "Đang lưu…", "Đã lưu lúc HH:mm", "Lưu lỗi – Thử lại", "Mất kết nối – sẽ lưu khi có mạng" (the header save state replaces a separate offline banner).
- Touch targets ≥ 44 px (`min-h-11`/`size-11`), `focus-visible` rings, tokens from `.claude/rules/design-tokens.md`.
- Engine test files start with `// @vitest-environment node` (Web Crypto, pdf-lib and three run without jsdom).
- Tests follow the repo pattern: spy on `api` (`vi.spyOn(api, "get")`) or `src/test/fake-backend.ts`; screens render with `renderWithProviders` from `src/test/render.tsx`; queries by role/label; `userEvent`.
- Commits: conventional (`feat(design): …`, `test(design): …`, `docs(design): …`), **no `Co-Authored-By` or tool-credit trailer**. Format only touched files (`pnpm exec prettier --write <files>`), never whole directories.
- Every task ends with `pnpm run typecheck && pnpm run lint && pnpm exec vitest run <touched test paths>` green before its commit.

## Review Focus

1. **Oversized or odd images** (a 9000 × 9000 PNG, a CMYK JPEG, a WebP): dimensions are read from the file header before decoding; > 40 MP is refused with a message; accepted images get a ≤ 2048 px proxy. Test owned by Task 19 (`readImageDimensions`) and Task 6 (proxy size).
2. **SVG logos without width/height** (viewBox only, or neither): rasterised at a size derived from the viewBox, else 2000 px wide; never uploaded as SVG; scripts never run (drawn through `<img>`). Test owned by Task 19 (`svgIntrinsicSize`).
3. **Autosave races**: edits while a save is in flight are saved afterwards with the new version; a 409 stops autosave and raises the conflict state; leaving the page flushes a pending save. Test owned by Task 15 (`createAutosaver`).
4. **Elements dragged or nudged off the surface**: the placement centre is clamped to the trim range so an element can never be lost outside the canvas. Test owned by Task 4 (`clampPlacement`) and Task 18 (arrow-key nudge at the edge).
5. **Empty or Vietnamese text**: committing an empty text deletes the element; text with diacritics ("Cà phê Sữa Đá") measures and renders with the selected font; a long single line that exceeds the area is a Fail. Tests owned by Task 20 (empty commit) and Task 7 (`OUTSIDE_PRINT_AREA` for long text).

---

## Part A — Engine core (`src/features/product-design/engine/`)

### Task 1: Geometry primitives

**Files:**

- Create: `engine/geometry/types.ts`, `engine/geometry/units.ts`, `engine/geometry/affine.ts`, `engine/geometry/polygon.ts`, `engine/geometry/simplify.ts`
- Modify: `vitest.config.ts` (coverage `include` += `"src/features/product-design/engine/**"`)
- Test: `engine/__tests__/geometry.test.ts`

**Interfaces:**

- Produces:
  - `type PointMm = { x: number; y: number }`, `type RectMm = { x: number; y: number; width: number; height: number }`
  - `type PathCmd = { c: "M" | "L"; x: number; y: number } | { c: "A"; cx: number; cy: number; r: number; start: number; end: number; ccw: boolean } | { c: "Z" }`
  - `MM_PER_INCH = 25.4`; `mmToPx(mm, dpi)`, `pxToMm(px, dpi)`, `ptToMm(pt)`, `mmToPt(mm)`, `effectiveDpi(naturalPx, placedMm)` (all `number`)
  - `type Mat2D = readonly [a, b, c, d, e, f]` (canvas `setTransform` order); `IDENTITY`, `multiply(m1, m2)` (= apply m2 then m1), `invert(m): Mat2D | null`, `applyToPoint(m, p): PointMm`, `translate(x, y)`, `rotate(rad)`, `scale(sx, sy)`
  - `pointInPolygon(p: PointMm, poly: PointMm[]): boolean`, `boundsOf(points: PointMm[]): RectMm`
  - `simplifyRdp<T extends readonly number[]>(points: T[], tolerance: number): T[]` (Ramer–Douglas–Peucker on `[x, y, …]`, keeps endpoints)

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment node
it("converts units", () => {
  expect(ptToMm(72)).toBeCloseTo(25.4);
  expect(mmToPt(25.4)).toBeCloseTo(72);
  expect(mmToPx(25.4, 300)).toBeCloseTo(300);
  expect(effectiveDpi(1200, 101.6)).toBeCloseTo(300);
});
it("composes, applies and inverts affine matrices", () => {
  const m = multiply(translate(10, 5), rotate(Math.PI / 2));
  expect(applyToPoint(m, { x: 1, y: 0 })).toMatchObject({
    x: expect.closeTo(10),
    y: expect.closeTo(6),
  });
  const back = applyToPoint(invert(m)!, applyToPoint(m, { x: 3, y: -2 }));
  expect(back.x).toBeCloseTo(3);
  expect(back.y).toBeCloseTo(-2);
  expect(invert(scale(0, 1))).toBeNull();
});
it("tests polygons and bounds", () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];
  expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true);
  expect(pointInPolygon({ x: 11, y: 5 }, sq)).toBe(false);
  expect(boundsOf(sq)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
});
it("simplifies a polyline with RDP and keeps endpoints", () => {
  const line = [
    [0, 0, 1],
    [1, 0.01, 1],
    [2, 0, 1],
    [3, 5, 1],
  ] as const;
  expect(simplifyRdp([...line], 0.1)).toEqual([
    [0, 0, 1],
    [2, 0, 1],
    [3, 5, 1],
  ]);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/geometry.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement the five files** with the signatures above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): engine geometry primitives`

---

### Task 2: Customization template schema and print surfaces

**Files:**

- Create: `engine/template/schema.ts`, `engine/surfaces/types.ts`, `engine/surfaces/cup.ts`, `engine/surfaces/bag.ts`, `engine/surfaces/index.ts`
- Test: `engine/__tests__/surfaces.test.ts`, `engine/__tests__/fixtures.ts` (shared engine fixtures: `cup12oz`, `bagM` templates)

**Interfaces:**

- Consumes: Task 1 types and helpers.
- Produces:
  - zod: `printAreaCodeSchema = z.enum(["BODY","FRONT","BACK","LEFT","RIGHT"])`, `cupModelSchema`, `bagModelSchema`, `gltfModelSchema`, `productModelSchema` (discriminated on `kind`), `printAreaSchema`, `customizationTemplateSchema` — fields exactly as spec §4.1; types `PrintAreaCode`, `CupModel`, `BagModel`, `ProductModel`, `PrintArea`, `CustomizationTemplate`, `MaterialKind = CupModel["material"] | BagModel["material"]`.
  - `customizationTemplateSchema.superRefine`: for a cup, every area's `annular-sector` shape must equal `cupSector(model)` trim values within 0.1 mm (radii) and 0.001 rad (sweep), else issue `"Print area <code> does not match the cup geometry"` on `printAreas.<i>.shape`; a bag's areas must be `rect`.
  - `type SurfaceRegion = "bleed" | "trim" | "safe"`; `type Guide = { kind: "bleed" | "trim" | "safe" | "seam" | "crease"; path: PathCmd[] }`
  - `interface PrintSurface { code: PrintAreaCode; kind: "rect" | "sector"; flatBounds: RectMm; uRange: [number, number]; vRange: [number, number]; bleedMm: number; toFlat(u, v): { x; y; uprightRad }; fromFlat(x, y): { u; v }; contains(p: PointMm, region: SurfaceRegion): boolean; inSeam(p: PointMm): boolean; outline(region: SurfaceRegion): PathCmd[]; guides(): Guide[]; uvOf(x, y): [number, number] }`
  - `type CupSector = { slantMm; outerRadiusMm; innerRadiusMm; sweepRad; midRadiusMm; trimOuterMm; trimInnerMm; seamRad }`; `cupSector(model: CupModel): CupSector`; `createCupSurface(model: CupModel, area: PrintArea): PrintSurface`
  - `createBagSurface(area: PrintArea): PrintSurface`
  - `type SurfaceSet = { order: PrintAreaCode[]; byCode: Readonly<Partial<Record<PrintAreaCode, PrintSurface>>> }`; `createSurfaces(template: CustomizationTemplate): SurfaceSet` (order = `printAreas` sorted by array order)

Cup algorithm (spec §4.3), with `rt = top/2`, `rb = bottom/2`, `H = heightMm`:
`slant = √(H² + (rt−rb)²)`, `Rt = rt·slant/(rt−rb)`, `Rb = Rt − slant`, `θ = 2π·rt/Rt`, `Rm = (Rt+Rb)/2`, `trimOuter = Rt − bandTopOffsetMm`, `trimInner = Rb + bandBottomOffsetMm`, `seamRad = seamMm / trimInner`.
Angles `φ ∈ [−θ/2, θ/2 + seamRad]` (the seam flap is past `+θ/2`). Apex `(cx, cy)` is chosen so the bleed region's bounding box (radii `trimOuter + bleed` … `trimInner − bleed`, angles widened by `bleed / trimInner`; computed by sampling 256 angles) starts at `(0, 0)`; `flatBounds` is that box.
`toFlat(u, v)`: `R = Rt − v`, `φ = u/Rm − θ/2`, `x = cx + R·sin φ`, `y = cy − R·cos φ`, `uprightRad = φ`. `fromFlat` is its inverse (`φ = atan2(x−cx, cy−y)`). `uRange = [0, (θ + seamRad)·Rm]`, `vRange = [bandTopOffsetMm, slant − bandBottomOffsetMm]`.
`contains`: trim = radius in `[trimInner, trimOuter]` and `φ` in range; bleed widens radii by `bleedMm` and angles by `bleedMm/R`; safe narrows radii by `safeMarginMm`, angles by `safeMarginMm/R`, and excludes the seam flap. `inSeam`: inside trim radii with `φ > θ/2`. `uvOf(x, y) = [x / W, 1 − y / H]` over `flatBounds`. If `rt − rb < 0.5`, return a rect surface whose width is `π·top + seamMm` (cylinder).
Bag: flat origin is the bleed box's top-left; `toFlat(u, v) = { x: u + bleed, y: v + bleed, uprightRad: 0 }`; `LEFT`/`RIGHT` add a `crease` guide at `u = width / 2`.

- [ ] **Step 1: Write the failing tests** (both fixtures: `minDpi` 300, `colorMode` RGB, `maxColors` null, `allowedFontCodes` null; fixture `cup12oz`: sku `CUP-PAPER-12OZ-WHT`, top 90, bottom 60, height 110, rimMm 3, seamMm 8, bandTop 6, bandBottom 8, material `paper-white`, bleed 2, safe 3, sector `{ innerRadiusMm: 230.04, outerRadiusMm: 327.05, sweepRad: 0.84894, seamMm: 8 }`; `bagM`: 260 × 120 × 320, topFold 40, FRONT/BACK 260 × 280, LEFT/RIGHT 120 × 280, bleed 3, safe 5)

```ts
it("derives the 12oz cup sector", () => {
  const s = cupSector(cup12oz.model as CupModel);
  expect(s.slantMm).toBeCloseTo(111.02, 2);
  expect(s.sweepRad * s.outerRadiusMm).toBeCloseTo(Math.PI * 90, 6); // rim circumference
  expect(s.sweepRad * s.innerRadiusMm).toBeCloseTo(Math.PI * 60, 6); // base circumference
  expect(s.trimOuterMm).toBeCloseTo(327.05, 2);
  expect(s.trimInnerMm).toBeCloseTo(230.04, 2);
  expect(s.seamRad).toBeCloseTo(0.03478, 4);
});
it("keeps an element upright and round-trips surface coordinates", () => {
  const cup = createSurfaces(cup12oz).byCode.BODY!;
  const s = cupSector(cup12oz.model as CupModel);
  expect(cup.toFlat((s.sweepRad * s.midRadiusMm) / 2, 50).uprightRad).toBeCloseTo(0);
  expect(cup.toFlat(0, 50).uprightRad).toBeCloseTo(-s.sweepRad / 2);
  for (const u of [0, 40, 140, 260])
    for (const v of [6, 50, 100]) {
      const f = cup.toFlat(u, v);
      const back = cup.fromFlat(f.x, f.y);
      expect(back.u).toBeCloseTo(u, 9);
      expect(back.v).toBeCloseTo(v, 9);
    }
});
it("classifies regions and the seam", () => {
  const cup = createSurfaces(cup12oz).byCode.BODY!;
  const front = (v: number) => {
    const f = cup.toFlat(cup.uRange[1] / 2 - 4, v);
    return { x: f.x, y: f.y };
  };
  expect(cup.contains(front(50), "safe")).toBe(true);
  expect(cup.contains(front(5), "trim")).toBe(false);
  expect(cup.contains(front(5), "bleed")).toBe(true);
  const flap = cup.toFlat(cup.uRange[1] - 2, 50);
  expect(cup.inSeam({ x: flap.x, y: flap.y })).toBe(true);
  expect(cup.inSeam(front(50))).toBe(false);
  const b = cup.flatBounds;
  const uv = [cup.uvOf(b.x, b.y), cup.uvOf(b.x + b.width, b.y + b.height)];
  expect(uv.flat().every((n) => n >= 0 && n <= 1)).toBe(true);
});
it("builds bag faces with bleed, safe and crease", () => {
  const set = createSurfaces(bagM);
  expect(set.order).toEqual(["FRONT", "BACK", "LEFT", "RIGHT"]);
  expect(set.byCode.FRONT!.flatBounds).toEqual({ x: 0, y: 0, width: 266, height: 286 });
  expect(set.byCode.FRONT!.toFlat(0, 0)).toEqual({ x: 3, y: 3, uprightRad: 0 });
  expect(set.byCode.FRONT!.contains({ x: 7, y: 50 }, "safe")).toBe(false);
  expect(set.byCode.LEFT!.guides().some((g) => g.kind === "crease")).toBe(true);
});
it("rejects a cup template whose print area does not match the geometry", () => {
  const bad = structuredClone(cup12oz);
  (bad.printAreas[0]!.shape as { sweepRad: number }).sweepRad = 0.9;
  expect(customizationTemplateSchema.safeParse(bad).success).toBe(false);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/surfaces.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the schema and surface files per the algorithm above.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): cup and bag print surfaces`

---

### Task 3: Design document schema, commands and history

**Files:**

- Create: `engine/document/schema.ts`, `engine/document/factory.ts`, `engine/document/commands.ts`, `engine/document/history.ts`, `engine/document/palette.ts`
- Test: `engine/__tests__/document.test.ts`

**Interfaces:**

- Consumes: `PrintAreaCode`, `CustomizationTemplate` (Task 2).
- Produces:
  - zod + types exactly as spec §4.2 (with the `drawing` element of §5): `hexSchema` (`/^#[0-9a-f]{6}$/i`, transformed to upper case), `placementSchema`, `imageElementSchema`, `textElementSchema`, `drawingElementSchema`, `elementSchema` (discriminated on `type`), `backgroundSchema`, `surfaceContentSchema` (`elements.max(MAX_ELEMENTS_PER_SURFACE)`), `designDocumentSchema`; `PATTERN_IDS = ["dots","stripes","checker","waves","grid","chevron"] as const`; types `Hex`, `Placement`, `ImageElement`, `TextElement`, `Stroke`, `DrawingElement`, `DesignElement`, `Background`, `SurfaceContent`, `DesignDocument`, `PatternId`.
  - `MAX_ELEMENTS_PER_SURFACE = 200`, `MAX_DOCUMENT_BYTES = 1_000_000`
  - `emptyDocument(template): DesignDocument` (every print area, `background: { kind: "none" }`, no elements)
  - `migrateDocument(raw: unknown): DesignDocument` (v1 parses; any other `schemaVersion` throws `Error("Unsupported design document version")`)
  - `documentByteSize(doc): number` (UTF-8 bytes of `JSON.stringify`)
  - Commands (pure; untouched surfaces keep reference identity): `addElement(doc, code, el, index?)`, `updateElement(doc, code, id, patch: Partial<DesignElement>)`, `removeElement(doc, code, id)`, `reorderElement(doc, code, id, toIndex)`, `duplicateElement(doc, code, id, newId)` (placement +5 mm u and v), `setBackground(doc, code, bg)`, `setBackgroundAll(doc, bg)`, `copySurface(doc, from, to, newId: () => string)`, `appendStroke(doc, code, drawingId, stroke)`
  - `class DocumentHistory { constructor(limit = 100); record(before: DesignDocument, gestureId?: string): void; undo(current): DesignDocument | null; redo(current): DesignDocument | null; clear(): void; readonly canUndo: boolean; readonly canRedo: boolean }` — consecutive `record` calls with the same `gestureId` keep only the first snapshot; `record` clears the redo stack.
  - `palette.ts`: `PRINT_SWATCHES: readonly Hex[]` (12 ink colours incl. `#000000`, `#FFFFFF`)

- [ ] **Step 1: Write the failing tests**

```ts
it("parses a minimal document and normalises hex", () => {
  const doc = emptyDocument(cup12oz);
  const parsed = designDocumentSchema.parse({
    ...doc,
    surfaces: { BODY: { background: { kind: "color", color: "#ff0000" }, elements: [] } },
  });
  expect(parsed.surfaces.BODY!.background).toEqual({ kind: "color", color: "#FF0000" });
});
it("rejects more than 200 elements on a surface and unknown versions", () => {
  const many = Array.from({ length: 201 }, (_, i) => textEl(`t${i}`));
  expect(
    surfaceContentSchema.safeParse({ background: { kind: "none" }, elements: many }).success,
  ).toBe(false);
  expect(() => migrateDocument({ schemaVersion: 2 })).toThrow(
    "Unsupported design document version",
  );
});
it("changes only the touched surface", () => {
  const doc = emptyDocument(bagM);
  const next = addElement(doc, "FRONT", textEl("a"));
  expect(next.surfaces.BACK).toBe(doc.surfaces.BACK);
  expect(next.surfaces.FRONT!.elements.map((e) => e.id)).toEqual(["a"]);
});
it("duplicates with an offset, reorders and copies a surface with new ids", () => {
  let doc = addElement(addElement(emptyDocument(bagM), "FRONT", textEl("a")), "FRONT", textEl("b"));
  doc = duplicateElement(doc, "FRONT", "a", "c");
  expect(doc.surfaces.FRONT!.elements.find((e) => e.id === "c")!.placement.u).toBe(
    textEl("a").placement.u + 5,
  );
  doc = reorderElement(doc, "FRONT", "b", 0);
  expect(doc.surfaces.FRONT!.elements[0]!.id).toBe("b");
  let n = 0;
  doc = copySurface(doc, "FRONT", "BACK", () => `n${++n}`);
  expect(doc.surfaces.BACK!.elements.map((e) => e.id)).toEqual(["n1", "n2", "n3"]);
});
it("undoes one gesture as one step and drops the oldest past the limit", () => {
  const h = new DocumentHistory(2);
  const d0 = emptyDocument(bagM);
  const d1 = addElement(d0, "FRONT", textEl("a"));
  const d2 = updateElement(d1, "FRONT", "a", { opacity: 0.5 });
  h.record(d0, "drag-1");
  h.record(d1, "drag-1");
  expect(h.undo(d2)).toBe(d0);
  expect(h.redo(d0)).toBe(d2);
  h.record(d0);
  h.record(d1);
  h.record(d2); // limit 2
  expect(h.undo(d2)).toBe(d2);
  expect(h.undo(d2)).toBe(d1);
  expect(h.undo(d1)).toBeNull();
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/document.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the five files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): design document model, commands and history`

---

### Task 4: Element geometry, text layout, hit-testing, clamping and snapping

**Files:**

- Create: `engine/render/fonts.ts`, `engine/render/text-layout.ts`, `engine/geometry/element.ts`, `engine/editor/snap.ts`
- Test: `engine/__tests__/element.test.ts`

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces:
  - `type FontRegistry = Readonly<Record<string, { label: string; family: string; italic: boolean }>>`
  - `type TextMeasurer = (text: string, fontCss: string) => { width: number; ascent: number; descent: number }` (px at the size inside `fontCss`); `createCanvasMeasurer(): TextMeasurer` (uses an offscreen 2D context; when `getContext` is null, width = 0.55 em per code point, ascent 0.8 em, descent 0.2 em)
  - `type TextLayout = { lines: { text: string; xMm: number; widthMm: number; baselineMm: number }[]; widthMm: number; heightMm: number; fontSizeMm: number; family: string; bold: boolean; italic: boolean }`; `layoutText(el: TextElement, fonts: FontRegistry, measure: TextMeasurer): TextLayout` — lines split on `\n` only; measured at a 100 px reference size and scaled to `ptToMm(sizePt)`; letter spacing adds `(codePoints − 1) × letterSpacingEm × fontSizeMm`; line pitch `lineHeight × fontSizeMm`; `xMm` per `align`; the box is centred on the origin.
  - `type ElementSizer = (el: DesignElement) => RectMm` (local box: image/text centred on origin; drawing = bounds of stroke points ± `sizeMm/2`); `createSizer(fonts, measure): ElementSizer`
  - `elementMatrix(el, surface): Mat2D` = `translate(toFlat(u,v)) · rotate(uprightRad + rotationDeg·π/180) · scale(scale·(flipX ? −1 : 1), scale·(flipY ? −1 : 1))` (flips only for images)
  - `elementOutline(el, surface, box: RectMm): PointMm[]` — 4 corners; for `wrap: true`, 16 samples along the top and bottom edges placed with the same arc mapping as Task 5's `warpStrips`
  - `hitTest(content: SurfaceContent, surface, sizer, p: PointMm): string | null` (topmost visible element whose outline contains `p`)
  - `clampPlacement(p: Placement, surface): Placement` (centre clamped to `uRange × vRange`)
  - `snapPlacement(p: { u: number; v: number }, targets: { u?: number; v?: number }[], thresholdMm = 2): { u: number; v: number; snappedU: number | null; snappedV: number | null }`; `surfaceSnapTargets(surface, others: Placement[]): { u?: number; v?: number }[]` (centre u/v of the surface, safe edges, other elements' centres)

- [ ] **Step 1: Write the failing tests** (fake measurer: width = 0.5 em per code point, ascent 0.8 em, descent 0.2 em)

```ts
it("lays out multi-line centred text in mm, Vietnamese included", () => {
  const l = layoutText(
    textEl("t", { content: "Cà phê\nSữa Đá", sizePt: 72, align: "center", lineHeight: 1.2 }),
    FONTS,
    fakeMeasure,
  );
  expect(l.fontSizeMm).toBeCloseTo(25.4);
  expect(l.lines.map((x) => x.text)).toEqual(["Cà phê", "Sữa Đá"]);
  expect(l.lines[0]!.widthMm).toBeCloseTo(6 * 0.5 * 25.4);
  expect(l.lines[0]!.xMm).toBeCloseTo(-l.lines[0]!.widthMm / 2);
});
it("orients an element on the cup with the local upright", () => {
  const cup = createSurfaces(cup12oz).byCode.BODY!;
  const m = elementMatrix(
    imageEl("i", { placement: { u: 0, v: 50, rotationDeg: 0, scale: 1 } }),
    cup,
  );
  expect(Math.atan2(m[1], m[0])).toBeCloseTo(cup.toFlat(0, 50).uprightRad);
});
it("hits the topmost visible element only", () => {
  const content = {
    background: { kind: "none" },
    elements: [imageEl("under"), imageEl("over"), { ...imageEl("ghost"), hidden: true }],
  } as SurfaceContent;
  const p = bagFront.toFlat(100, 100);
  expect(hitTest(content, bagFront, sizer, p)).toBe("over");
});
it("clamps a placement inside the surface", () => {
  expect(clampPlacement({ u: -500, v: 9999, rotationDeg: 0, scale: 1 }, bagFront)).toMatchObject({
    u: 0,
    v: 280,
  });
});
it("snaps to a target within 2 mm", () => {
  expect(snapPlacement({ u: 129, v: 50 }, [{ u: 130 }])).toMatchObject({
    u: 130,
    snappedU: 130,
    snappedV: null,
  });
  expect(snapPlacement({ u: 125, v: 50 }, [{ u: 130 }]).snappedU).toBeNull();
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/element.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): element geometry, text layout and snapping`

---

### Task 5: Compositor (`compose` → `DrawOp[]`)

**Files:**

- Create: `engine/render/ops.ts`, `engine/render/warp.ts`, `engine/render/compose.ts`
- Test: `engine/__tests__/compose.test.ts`

**Interfaces:**

- Consumes: Tasks 1–4.
- Produces:
  - `type ComposeTarget = "editor" | "texture" | "preview" | "print"`
  - `type DrawOp =`
    `{ op: "save" } | { op: "restore" } | { op: "clip"; path: PathCmd[] }`
    `| { op: "fill"; path: PathCmd[]; color: Hex }`
    `| { op: "pattern"; bounds: RectMm; patternId: PatternId; colors: [Hex, Hex]; scale: number; rotationDeg: number }`
    `| { op: "image"; matrix: Mat2D; box: RectMm; assetId: string; opacity: number }`
    `| { op: "text"; matrix: Mat2D; layout: TextLayout; color: Hex; outline?: { color: Hex; widthMm: number }; opacity: number }`
    `| { op: "drawing"; matrix: Mat2D; box: RectMm; strokes: Stroke[]; opacity: number }`
    `| { op: "warped"; source: Extract<DrawOp, { op: "image" | "text" }>; strips: Strip[] }`
    `| { op: "multiply"; path: PathCmd[]; color: Hex }`
    `| { op: "guides"; guides: Guide[]; shadeOutside: PathCmd[] }`
  - `type Strip = { srcX: number; srcWidth: number; matrix: Mat2D }`; `warpStrips(el: DesignElement, surface, box: RectMm, count = 48): Strip[]` — strip `i` covers local x `[box.x + i·w/n, +w/n]`; its centre local x `xc` maps to `u_i = el.placement.u + xc·scale·Rm/R_el` with `R_el = Rt − v` (cup) or `u_i = u + xc·scale` (rect); `matrix_i = translate(toFlat(u_i, v)) · rotate(upright_i + rotation) · scale(scale) · translate(−xc, 0)`.
  - `KRAFT_INK_TINT: Hex = "#B4875A"` (kraft-brown) — applied only for `material === "kraft" | "kraft-brown"`.
  - `compose(input: { surface: PrintSurface; content: SurfaceContent; target: ComposeTarget; material: MaterialKind; sizer: ElementSizer; fonts: FontRegistry; measure: TextMeasurer }): DrawOp[]`
    Order: `save`, `clip(outline("bleed"))`, background (`fill` over the bleed outline, or `pattern` over `flatBounds`), one op per visible element in array order (`warped` when `wrap`), `multiply` (texture/preview + kraft only), `restore`, then `guides` (editor only; `shadeOutside` = trim outline).

- [ ] **Step 1: Write the failing tests**

```ts
const base = (target: ComposeTarget, material: MaterialKind = "paper-white") =>
  compose({
    surface: cupBody,
    content,
    target,
    material,
    sizer,
    fonts: FONTS,
    measure: fakeMeasure,
  });
it("clips to bleed, paints background then elements in order", () => {
  expect(base("print").map((o) => o.op)).toEqual([
    "save",
    "clip",
    "fill",
    "image",
    "text",
    "restore",
  ]);
});
it("skips hidden elements", () => {
  const ops = compose({
    ...input,
    content: { ...content, elements: [{ ...imageEl("x"), hidden: true }] },
    target: "print",
  });
  expect(ops.some((o) => o.op === "image")).toBe(false);
});
it("draws guides only in the editor", () => {
  expect(base("editor").at(-1)!.op).toBe("guides");
  expect(base("texture").some((o) => o.op === "guides")).toBe(false);
});
it("multiplies kraft only for texture and preview", () => {
  expect(base("texture", "kraft").some((o) => o.op === "multiply")).toBe(true);
  expect(base("print", "kraft").some((o) => o.op === "multiply")).toBe(false);
  expect(base("texture", "paper-white").some((o) => o.op === "multiply")).toBe(false);
});
it("wraps text along the cup arc at one radius", () => {
  const ops = compose({
    ...input,
    content: { ...content, elements: [{ ...textEl("w"), wrap: true }] },
    target: "print",
  });
  const warped = ops.find((o) => o.op === "warped") as Extract<DrawOp, { op: "warped" }>;
  expect(warped.strips).toHaveLength(48);
  const radii = warped.strips.map((s) => Math.hypot(s.matrix[4] - apex.x, s.matrix[5] - apex.y)); // apex from cupBody.toFlat inverse
  radii.forEach((r) => expect(r).toBeCloseTo(radii[0]!, 6));
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/compose.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): compositor draw operations`

---

### Task 6: Canvas executor, patterns, brush and image cache

**Files:**

- Create: `engine/render/execute.ts`, `engine/render/patterns.ts`, `engine/render/brush.ts`, `engine/render/image-cache.ts`, `engine/render/render-surface.ts`
- Modify: `package.json` / `pnpm-lock.yaml` (`pnpm add perfect-freehand`)
- Test: `engine/__tests__/execute.test.ts`, `engine/__tests__/image-cache.test.ts`

**Interfaces:**

- Consumes: Task 5 `DrawOp`.
- Produces:
  - `type Ctx2D = Pick<CanvasRenderingContext2D, "save" | "restore" | "setTransform" | "transform" | "beginPath" | "moveTo" | "lineTo" | "arc" | "closePath" | "clip" | "fill" | "stroke" | "fillRect" | "drawImage" | "fillText" | "strokeText" | "rotate" | "translate" | "scale"> & { fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string; textBaseline: CanvasTextBaseline; globalAlpha: number; globalCompositeOperation: GlobalCompositeOperation; lineJoin: CanvasLineJoin }`
  - `type RenderEnv = { pxPerMm: number; image(assetId: string): CanvasImageSource | undefined; createLayer(widthPx: number, heightPx: number): { source: CanvasImageSource; ctx: Ctx2D } }`
  - `execute(ops: DrawOp[], ctx: Ctx2D, env: RenderEnv): void` — base transform `scale(pxPerMm)`; `image` with no source paints a muted placeholder rect (never throws); `text` sets `font` from the layout (`${italic ? "italic " : ""}${bold ? 700 : 400} ${sizePx}px ${family}`), draws `strokeText` (outline) then `fillText` per line; `drawing` renders strokes into `createLayer` then draws the layer (erase strokes use `destination-out` inside the layer only); `warped` renders the source op into a layer (reused from `env.layerCache?: Map<string, CanvasImageSource>` keyed by `canonicalJson(source) + pxPerMm`, so a wrapped element is rasterised once until it changes) and draws each strip; `multiply` uses `globalCompositeOperation = "multiply"` filled with the tint.
  - `drawPattern(ctx, op: Extract<DrawOp, { op: "pattern" }>): void` (procedural, colours[0] = ground, colours[1] = motif, `scale` = motif pitch in mm)
  - `strokePolygon(stroke: Stroke): [number, number][]` via `getStroke(points, { size: sizeMm, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: <all pressures equal> })`
  - `class ImageCache { constructor(opts: { maxBytes: number; decode: (blob: Blob, maxEdge?: number) => Promise<{ image: CanvasImageSource; width: number; height: number; bytes: number }> }); get(assetId: string, variant: "proxy" | "full"): CanvasImageSource | undefined; load(assetId: string, blob: Blob, variant: "proxy" | "full"): Promise<CanvasImageSource>; }` — proxy decodes with `maxEdge = 2048`; LRU eviction by bytes. `browserDecode` (default) uses `createImageBitmap(blob, { resizeWidth/Height })`.
  - `renderSurface(canvas: HTMLCanvasElement, ops: DrawOp[], env: RenderEnv, flatBounds: RectMm): void` (sizes the canvas to `ceil(bounds × pxPerMm)` and calls `execute`; no-op when `getContext("2d")` is null)

- [ ] **Step 1: Write the failing tests** with a recording `Ctx2D` (records `[method, ...args]` and property sets)

```ts
it("scales mm to px and draws text lines with the layout font", () => {
  execute(textOps, rec.ctx, env({ pxPerMm: 4 }));
  expect(rec.calls).toContainEqual(["scale", 4, 4]);
  expect(rec.sets.font).toContain("Be Vietnam Pro");
  expect(rec.calls.filter(([m]) => m === "fillText")).toHaveLength(2);
});
it("paints a placeholder when an image is missing", () => {
  expect(() => execute([imageOp("missing")], rec.ctx, env())).not.toThrow();
  expect(rec.calls.some(([m]) => m === "fillRect")).toBe(true);
});
it("erases only inside the drawing layer", () => {
  execute([drawingOp([drawStroke, eraseStroke])], rec.ctx, env());
  expect(layer.sets.globalCompositeOperation).toContain("destination-out");
  expect(rec.sets.globalCompositeOperation ?? []).not.toContain("destination-out");
});
it("evicts the least recently used image beyond maxBytes and decodes proxies at 2048", async () => {
  const decode = vi.fn(async (_b: Blob, maxEdge?: number) => ({
    image: {} as CanvasImageSource,
    width: maxEdge ?? 4000,
    height: 10,
    bytes: 600,
  }));
  const cache = new ImageCache({ maxBytes: 1000, decode });
  await cache.load("a", blob, "proxy");
  await cache.load("b", blob, "proxy");
  expect(decode).toHaveBeenCalledWith(blob, 2048);
  expect(cache.get("a", "proxy")).toBeUndefined();
  expect(cache.get("b", "proxy")).toBeDefined();
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/execute.test.ts src/features/product-design/engine/__tests__/image-cache.test.ts` — Expected: FAIL.
- [ ] **Step 3:** `pnpm add perfect-freehand`; implement the five files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): canvas executor, patterns, brush and image cache`

---

### Task 7: Preflight

**Files:**

- Create: `engine/preflight/types.ts`, `engine/preflight/run.ts`, `engine/preflight/rules/area.ts`, `engine/preflight/rules/resolution.ts`, `engine/preflight/rules/content.ts`, `engine/preflight/rules/color.ts`
- Test: `engine/__tests__/preflight.test.ts`

**Interfaces:**

- Consumes: Tasks 2–4 (`elementOutline`, `ElementSizer`, surfaces).
- Produces:
  - `type PreflightRuleId = "OUTSIDE_PRINT_AREA" | "DPI_BELOW_MIN" | "FONT_NOT_ALLOWED" | "ASSET_INVALID" | "EMPTY_DESIGN" | "CROSSES_SAFE_AREA" | "DPI_LOW" | "ON_SEAM" | "TOO_THIN" | "WHITE_ON_KRAFT" | "TOO_MANY_COLORS" | "CMYK_CONVERSION"`
  - `type PreflightIssue = { ruleId: PreflightRuleId; level: "fail" | "warning" | "info"; message: string; surfaceCode?: PrintAreaCode; elementId?: string }`; `type PreflightReport = { result: "Pass" | "Warning" | "Fail"; issues: PreflightIssue[] }`
  - `type PreflightInput = { document: DesignDocument; template: CustomizationTemplate; surfaces: SurfaceSet; sizer: ElementSizer; assets: Readonly<Record<string, { contentType: string; sizeBytes: number; status: "ready" | "error" }>>; fontStatus: Readonly<Record<string, "ready" | "loading" | "error">> }`
  - `runPreflight(input: PreflightInput): PreflightReport` (result = highest level; info does not change Pass)

Rules (spec §8; each rule file cites its BR in a comment; messages exact):

| ruleId               | Condition                                                                                | Message                                                               |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `OUTSIDE_PRINT_AREA` | any outline point outside `contains(…, "bleed")`, or no outline point inside trim        | "Phần tử nằm ngoài vùng in và sẽ bị cắt mất."                         |
| `DPI_BELOW_MIN`      | image DPI (min of both axes, using `widthMm × scale`) `< minDpi`                         | "Ảnh chỉ đạt {dpi} DPI, thấp hơn mức tối thiểu {minDpi} DPI."         |
| `DPI_LOW`            | `minDpi ≤ DPI < 1.5 × minDpi`                                                            | "Ảnh đạt {dpi} DPI, bản in có thể hơi mờ."                            |
| `FONT_NOT_ALLOWED`   | font not in `allowedFontCodes` (when set) or `fontStatus = error`                        | "Phông chữ này không được phép in hoặc chưa tải được."                |
| `ASSET_INVALID`      | asset missing/error, type not in `allowedFileFormats`, or `sizeBytes > maxFileSizeMb` MB | "Ảnh không hợp lệ hoặc không tải được."                               |
| `EMPTY_DESIGN`       | no visible element and every background `none`                                           | "Thiết kế chưa có nội dung."                                          |
| `CROSSES_SAFE_AREA`  | inside trim but some outline point outside safe                                          | "Phần tử vượt vùng an toàn, có thể bị xén khi cắt."                   |
| `ON_SEAM`            | some outline point `inSeam`                                                              | "Phần tử nằm trên mép dán của ly và sẽ bị che."                       |
| `TOO_THIN`           | stroke `sizeMm < 0.25`, outline `widthMm < 0.25`, or text `sizePt < 6`                   | "Nét hoặc chữ quá mảnh để in rõ."                                     |
| `WHITE_ON_KRAFT`     | kraft material and a text/stroke/background colour with relative luminance > 0.92        | "Giấy kraft không in được màu trắng."                                 |
| `TOO_MANY_COLORS`    | `maxColors` set and (distinct solid colours > `maxColors` or any image present)          | "Thiết kế dùng nhiều màu hơn mức cho phép ({maxColors})."             |
| `CMYK_CONVERSION`    | `colorMode = "CMYK"` (one info issue)                                                    | "Màu sẽ được chuyển sang CMYK khi in, có thể nhạt hơn trên màn hình." |

- [ ] **Step 1: Write the failing tests** — one `it` per rule asserting `ruleId`, `level`, `elementId` and `surfaceCode`, plus:

```ts
it("passes a clean design and reports the highest level", () => {
  expect(runPreflight(input(cleanDoc)).result).toBe("Pass");
  expect(runPreflight(input(withLowDpi(320))).result).toBe("Warning"); // minDpi 300 → 320 < 450
  expect(runPreflight(input(withLowDpi(200))).result).toBe("Fail");
});
it("fails a long single-line text that runs past the bleed", () => {
  const report = runPreflight(input(withText("THƯƠNG HIỆU CÀ PHÊ SỮA ĐÁ SÀI GÒN ".repeat(4), 48)));
  expect(report.issues).toContainEqual(
    expect.objectContaining({ ruleId: "OUTSIDE_PRINT_AREA", level: "fail" }),
  );
});
it("keeps CMYK as info without failing", () => {
  const r = runPreflight(input(cleanDoc, { colorMode: "CMYK" }));
  expect(r.result).toBe("Pass");
  expect(r.issues[0]!.ruleId).toBe("CMYK_CONVERSION");
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/preflight.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the six files.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): client preflight rules`

---

### Task 8: Editor controller and shortcuts

**Files:**

- Create: `engine/editor/controller.ts`, `engine/editor/shortcuts.ts`, `engine/index.ts` (public exports of everything later tasks use)
- Test: `engine/__tests__/controller.test.ts`

**Interfaces:**

- Consumes: Tasks 2–4.
- Produces:
  - `type ToolId = "select" | "image" | "text" | "brush" | "eraser" | "background"`
  - `type EditorState = { document: DesignDocument; activeSurface: PrintAreaCode; selectedId: string | null; tool: ToolId; zoom: number; readOnly: boolean; brush: { sizeMm: number; color: Hex; opacity: number }; eraser: { sizeMm: number }; revision: number; canUndo: boolean; canRedo: boolean }`
  - `type EditorController = { store: StoreApi<EditorState>; apply(command: (doc: DesignDocument) => DesignDocument, opts?: { gestureId?: string }): void; undo(): void; redo(): void; select(id: string | null): void; setTool(tool: ToolId): void; setActiveSurface(code: PrintAreaCode): void; setZoom(zoom: number): void; setReadOnly(readOnly: boolean): void; setBrush(patch: Partial<EditorState["brush"]>): void; setEraser(patch: Partial<EditorState["eraser"]>): void; replaceDocument(doc: DesignDocument): void; onDocumentChange(listener: (doc: DesignDocument, changed: PrintAreaCode[]) => void): () => void; newId(): string }`
  - `createEditor(opts: { template: CustomizationTemplate; document: DesignDocument; newId?: () => string }): EditorController` (`zustand/vanilla` `createStore`; `zoom` clamped to `[0.25, 8]`; `apply` is a no-op when `readOnly`; `changed` = surfaces whose object identity changed; removing the selected element clears `selectedId`; `replaceDocument` clears history and emits every surface)
  - `type ShortcutAction = "undo" | "redo" | "delete" | "duplicate" | "raise" | "lower" | "nudge" | "tool"`; `resolveShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): { action: ShortcutAction; tool?: ToolId; dx?: number; dy?: number } | null` — Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl/⌘+Y redo, Delete/Backspace delete, Ctrl/⌘+D duplicate, Ctrl/⌘+] raise, Ctrl/⌘+[ lower, arrows nudge 0.5 mm (Shift 5 mm), V/U/T/B/E/G tools.

- [ ] **Step 1: Write the failing tests**

```ts
it("applies commands, reports changed surfaces and undoes/redoes", () => {
  const ed = createEditor({ template: bagM, document: emptyDocument(bagM), newId: seq() });
  const seen: PrintAreaCode[][] = [];
  ed.onDocumentChange((_d, c) => seen.push(c));
  ed.apply((d) => addElement(d, "FRONT", textEl("a")));
  expect(seen).toEqual([["FRONT"]]);
  expect(ed.store.getState()).toMatchObject({ revision: 1, canUndo: true });
  ed.undo();
  expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(0);
  ed.redo();
  expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(1);
});
it("ignores edits in read-only mode and clears a removed selection", () => {
  const ed = createEditor({ template: bagM, document: docWith("a") });
  ed.select("a");
  ed.apply((d) => removeElement(d, "FRONT", "a"));
  expect(ed.store.getState().selectedId).toBeNull();
  ed.setReadOnly(true);
  ed.apply((d) => addElement(d, "FRONT", textEl("b")));
  expect(ed.store.getState().document.surfaces.FRONT!.elements).toHaveLength(0);
});
it("maps shortcuts", () => {
  expect(resolveShortcut(k("z", { ctrlKey: true }))).toEqual({ action: "undo" });
  expect(resolveShortcut(k("y", { ctrlKey: true }))).toEqual({ action: "redo" });
  expect(resolveShortcut(k("ArrowLeft", { shiftKey: true }))).toEqual({
    action: "nudge",
    dx: -5,
    dy: 0,
  });
  expect(resolveShortcut(k("t"))).toEqual({ action: "tool", tool: "text" });
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/controller.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the files; `engine/index.ts` re-exports Tasks 1–8 public names.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): editor controller and shortcuts`

---

### Task 9: Export builders (checksum, summary, PDFs)

**Files:**

- Create: `engine/export/checksum.ts`, `engine/export/summary.ts`, `engine/export/print-pdf.ts`, `engine/export/spec-sheet.ts`
- Modify: `package.json` / lockfile (`pnpm add pdf-lib`); `engine/index.ts` exports
- Test: `engine/__tests__/export.test.ts`

**Interfaces:**

- Consumes: `DesignDocument`, `CustomizationTemplate`, `PreflightReport`, `PathCmd`.
- Produces:
  - `canonicalJson(value: unknown): string` (object keys sorted recursively); `documentChecksum(doc): Promise<string>` (SHA-256 hex of `canonicalJson`, `globalThis.crypto.subtle`)
  - `type SpecSummary = { title: string; lines: string[] }`; `buildSpecSummary(input: { name: string; template: CustomizationTemplate; document: DesignDocument; report: PreflightReport; checksum: string }): SpecSummary` — lines: template code/name, SKU, per area "`<name>`: W × H mm, n phần tử", fonts used, colours used, "Preflight: <result>" + each issue, "SHA-256: <checksum>"
  - `specText(summary): string` — joined with `\n`, at most 4000 chars (truncated with `…`)
  - `type PrintPage = { code: PrintAreaCode; widthMm: number; heightMm: number; png: Uint8Array; cutPath: PathCmd[] }`; `buildPrintPdf(pages: PrintPage[]): Promise<Uint8Array>` — one page per area, size `mmToPt(widthMm) × mmToPt(heightMm)`, PNG drawn full-page, cut path stroked 0.25 pt in a Separation colour space named `CutContour` (alternate DeviceCMYK, tint transform: FunctionType 2, `C0 [0 0 0 0]`, `C1 [0 1 0 0]`, `N 1`) registered in the page's `/Resources /ColorSpace` and selected with `CS`/`SCN` operators; arcs approximated by cubic Béziers (≤ 90° per segment)
  - `buildSheetPdf(png: Uint8Array, widthMm = 210, heightMm = 297): Promise<Uint8Array>`; `drawSpecSheet(ctx: Ctx2D, summary: SpecSummary, pxPerMm: number): void` (browser canvas text, so Vietnamese renders with the page fonts)

- [ ] **Step 1: Write the failing tests** (`PNG_1x1` fixture bytes)

```ts
it("hashes a document independent of key order", async () => {
  expect(await documentChecksum({ b: 1, a: 2 } as never)).toBe(
    await documentChecksum({ a: 2, b: 1 } as never),
  );
  expect(await documentChecksum(emptyDocument(bagM))).toMatch(/^[0-9a-f]{64}$/);
});
it("summarises within 4000 chars", () => {
  const text = specText(
    buildSpecSummary({
      name: "Ly quán A",
      template: cup12oz,
      document: bigDoc,
      report,
      checksum: "ab".repeat(32),
    }),
  );
  expect(text.length).toBeLessThanOrEqual(4000);
  expect(text).toContain(cup12oz.sku);
  expect(text).toContain("Preflight: Pass");
});
it("sizes print pages in pt and carries a CutContour cut path", async () => {
  const bytes = await buildPrintPdf([
    { code: "FRONT", widthMm: 266, heightMm: 286, png: PNG_1x1, cutPath: rectPath },
  ]);
  const pdf = await PDFDocument.load(bytes);
  const { width, height } = pdf.getPage(0).getSize();
  expect(width).toBeCloseTo((266 * 72) / 25.4, 2);
  expect(height).toBeCloseTo((286 * 72) / 25.4, 2);
  expect(Buffer.from(bytes).toString("latin1")).toContain("/CutContour");
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/export.test.ts` — Expected: FAIL.
- [ ] **Step 3:** `pnpm add pdf-lib`; implement. Load pdf-lib with `await import("pdf-lib")` inside the two builders so it stays out of the studio's first chunk.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): print-ready and technical-spec export`

---

### Task 10: 3D mesh builders and pick mapping

**Files:**

- Create: `engine/viewer3d/cup-mesh.ts`, `engine/viewer3d/bag-mesh.ts`, `engine/viewer3d/pick.ts`
- Modify: `package.json` / lockfile (`pnpm add three`, `pnpm add -D @types/three`)
- Test: `engine/__tests__/meshes.test.ts`

**Interfaces:**

- Consumes: `CupModel`, `BagModel`, `PrintSurface`, `cupSector`.
- Produces (scene units = mm, cup axis +Y, base at y = 0, front faces +Z; axis angle α = 0 at −Z (seam at the back), increasing towards +X):
  - `type CupGeometry = { body: BufferGeometry; rim: BufferGeometry; bottom: BufferGeometry; inner: BufferGeometry }`; `buildCupGeometry(model: CupModel, surface: PrintSurface, opts?: { radialSegments?: number /*128*/; heightSegments?: number /*16*/ }): CupGeometry` — body vertex (α, v): position on the frustum; uv = `surface.uvOf(surface.toFlat((α / 2π)·θ·Rm, v))` (for a rect/cylinder surface: `u = (α / 2π)·π·top`)
  - `type BagGeometry = { panels: Record<"FRONT" | "BACK" | "LEFT" | "RIGHT", BufferGeometry>; bottom: BufferGeometry; fold: BufferGeometry; handles: BufferGeometry[] }`; `buildBagGeometry(model: BagModel, surfaces: SurfaceSet): BagGeometry` — each panel's uv maps its trim box into its surface texture via `uvOf`
  - `uvToSurfacePoint(surface: PrintSurface, uv: [number, number]): { u: number; v: number }` (inverse of `uvOf` then `fromFlat`)

- [ ] **Step 1: Write the failing tests**

```ts
it("builds a cup body whose UVs follow the dieline", () => {
  const surface = createSurfaces(cup12oz).byCode.BODY!;
  const g = buildCupGeometry(cup12oz.model as CupModel, surface, {
    radialSegments: 64,
    heightSegments: 8,
  });
  expect(g.body.getAttribute("position").count).toBe(65 * 9);
  const uv = g.body.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
    expect(uv.getX(i)).toBeLessThanOrEqual(1);
  }
  const s = cupSector(cup12oz.model as CupModel);
  const front = surface.uvOf(...xy(surface.toFlat((s.sweepRad * s.midRadiusMm) / 2, 6)));
  expect([uv.getX(32), uv.getY(32)]).toEqual([
    expect.closeTo(front[0], 6),
    expect.closeTo(front[1], 6),
  ]); // α = π, top ring
});
it("maps a picked UV back to surface coordinates", () => {
  const surface = createSurfaces(cup12oz).byCode.BODY!;
  const f = surface.toFlat(120, 40);
  const p = uvToSurfacePoint(surface, surface.uvOf(f.x, f.y));
  expect(p.u).toBeCloseTo(120, 6);
  expect(p.v).toBeCloseTo(40, 6);
});
it("builds four bag panels and two handles", () => {
  const g = buildBagGeometry(bagM.model as BagModel, createSurfaces(bagM));
  expect(Object.keys(g.panels)).toEqual(["FRONT", "BACK", "LEFT", "RIGHT"]);
  expect(g.handles).toHaveLength(2);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/meshes.test.ts` — Expected: FAIL.
- [ ] **Step 3:** `pnpm add three` and `pnpm add -D @types/three`; implement (frustum ring + `TorusGeometry` rim + `CircleGeometry` bottom + back-side inner wall; bag panels as `PlaneGeometry` placed on a box, gusset crease as a two-quad fold, handles as `TubeGeometry` on a `CatmullRomCurve3`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): parametric cup and bag meshes`

---

### Task 11: `ProductViewer`

**Files:**

- Create: `engine/viewer3d/materials.ts`, `engine/viewer3d/webgl.ts`, `engine/viewer3d/product-viewer.ts`
- Modify: `engine/index.ts` (export `ProductViewer`, `isWebGLAvailable`, `ViewerOptions`)
- Test: `engine/__tests__/product-viewer.test.ts` (jsdom environment — do **not** add the node pragma)

**Interfaces:**

- Consumes: Task 10, `MaterialKind`, `SurfaceSet`.
- Produces:
  - `isWebGLAvailable(): boolean` (tries `webgl2` then `webgl` on a throwaway canvas; false on null/throw)
  - `createMaterials(kind: MaterialKind): { base: Material; print(texture: CanvasTexture): Material }` (paper `MeshStandardMaterial` roughness 0.85; kraft with a procedural fibre `CanvasTexture`; PET `MeshPhysicalMaterial` transmission 0.9, roughness 0.15, print as a transparent decal)
  - `type ViewerOptions = { createRenderer?: (canvas: HTMLCanvasElement) => WebGLRenderer; environment?: boolean /*true*/ }`
  - `class ProductViewer { constructor(canvas: HTMLCanvasElement, opts?: ViewerOptions); setModel(template: CustomizationTemplate, surfaces: SurfaceSet): void; setSurfaceTexture(code: PrintAreaCode, source: HTMLCanvasElement): void; focusSurface(code: PrintAreaCode): void; setAutoRotate(on: boolean): void; resetView(): void; pick(clientX: number, clientY: number): { surfaceCode: PrintAreaCode; u: number; v: number } | null; screenshot(opts: { width: number; height: number }): Promise<Blob>; on(event: "contextlost" | "error", cb: (e?: unknown) => void): () => void; dispose(): void }`
    Renderer: `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, pixel ratio `min(devicePixelRatio, 2)`; `RoomEnvironment` via `PMREMGenerator` when `environment`; `OrbitControls` (damping, `enablePan = false`, polar angle 0.15π…0.85π, distance 1.2–4 × model height); contact shadow = plane with a radial-gradient `CanvasTexture`; renders only on `invalidate()` (texture/camera/resize) with `ResizeObserver`, pauses on `document.hidden` and when an `IntersectionObserver` reports off-screen; textures set before `setModel` are applied once the model exists; `gltf` models throw `Error("GLB models are not enabled")` (caller falls back); two `webglcontextlost` events emit `contextlost`; `dispose()` disposes geometries, materials, textures, controls and the renderer.

- [ ] **Step 1: Write the failing tests**

```ts
it("reports no WebGL in jsdom", () => expect(isWebGLAvailable()).toBe(false));
it("applies a texture set before the model and disposes everything", () => {
  const renderer = fakeRenderer();
  const viewer = new ProductViewer(document.createElement("canvas"), {
    createRenderer: () => renderer,
    environment: false,
  });
  viewer.setSurfaceTexture("BODY", document.createElement("canvas"));
  viewer.setModel(cup12oz, createSurfaces(cup12oz));
  expect(viewer["printMaterials"].get("BODY")).toBeDefined(); // internal map name fixed here
  viewer.dispose();
  expect(renderer.dispose).toHaveBeenCalled();
});
it("refuses GLB models", () => {
  const viewer = new ProductViewer(document.createElement("canvas"), {
    createRenderer: () => fakeRenderer(),
    environment: false,
  });
  expect(() => viewer.setModel(gltfTemplate, createSurfaces(gltfTemplate))).toThrow(
    "GLB models are not enabled",
  );
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/product-viewer.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the three files (`printMaterials: Map<PrintAreaCode, Material>` is the internal map the test reads).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): three.js product viewer`

---

## Part B — Data layer and mock backend

### Task 12: DTO schemas, API client functions, errors and capabilities

**Files:**

- Replace: `src/features/product-design/schemas.ts`, `types.ts`, `api.ts`, `index.ts` (old mock code removed)
- Create: `src/features/product-design/errors.ts`, `src/features/product-design/capabilities.ts`
- Test: `src/features/product-design/__tests__/api.test.ts`, `__tests__/schemas.test.ts`, `__tests__/fixtures.ts` (BE-shaped DTO fixtures)

**Interfaces:**

- Consumes: engine `customizationTemplateSchema`, `designDocumentSchema`.
- Produces:
  - Schemas (DTO = BE `origin/develop` shape, spec §2.2/§7.2; ids `z.string().uuid()`-like as the catalog's `beId()`): `designStatusSchema = z.enum(["DRAFT","SUBMITTED","APPROVED","REJECTED"])`, `artifactRoleSchema = z.enum(["CUSTOMER_PREVIEW","TECHNICAL_SPEC","PRINT_READY","PRODUCTION_INSTRUCTION"])`, `designDraftDtoSchema` (BE fields + optional P6 `sku, templateCode, reviewRequestedAt, reviewedAt, updatedAt, previewArtifactId`), `designPageDtoSchema` (BE `PageResponse`), `designDecisionDtoSchema`, `designSnapshotDtoSchema`, `designArtifactDtoSchema`, `downloadLinkDtoSchema`, `designDocumentRecordDtoSchema` (`{designId, version, document, checksum, updatedAt}`), `designAssetDtoSchema`, `customizationDtoSchema` (`{productId, kind: z.enum(["STANDARD","CUSTOMIZABLE"]), templates: customizationTemplateSchema[]}`); inputs `createDesignInputSchema` (`productId`, `sku`, `templateCode`, `name` 1–200 trimmed), `changeReasonInputSchema` (`reason` 1–2000 trimmed).
  - Types via `z.infer`: `DesignDraft`, `DesignPage`, `DesignDecision`, `DesignSnapshot`, `DesignArtifact`, `ArtifactRole`, `DownloadLink`, `DesignDocumentRecord`, `DesignAsset`, `Customization`, `CreateDesignInput`, `DesignStatus`.
  - `api.ts` (all via `api` from `@/lib/api/client`, parse once, optional `signal`; pages 1-based in, 0-based to the BE):
    `listDesigns(p: { page: number; size: number; status?: DesignStatus }, signal?)`, `getDesign(id)`, `getDesignHistory(id, p)`, `getDesignSnapshot(id)`, `createDesign(input)` → `POST /designs/mine`, `getCustomization(slug)` → `GET /catalog/products/{slug}/customization`, `getDesignDocument(id)`, `saveDesignDocument(id, body: { version: number; document: DesignDocument })` (refuses `documentByteSize > MAX_DOCUMENT_BYTES` before calling), `listDesignAssets(id)`, `uploadDesignAsset(id, file: Blob, name: string, idempotencyKey: string)`, `getAssetDownloadUrl(id, assetId)`, `listArtifacts(id)`, `uploadArtifact(id, role, file: Blob, name: string, idempotencyKey: string)`, `getArtifactDownloadUrl(id, artifactId)`, `reviseSpecification(id, { version, spec })`, `requestTechnicalReview(id, { version })`, `submitForConfirmation(id, { version })`, `confirmDesign(id, { version, artifactId })`, `requestChanges(id, { version, reason })`, `withdrawConfirmation(id, { version, reason })`, `forkDesign(id)`.
    Multipart calls send a `FormData` with field `file` and `headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": key }` — the client's default JSON content type would otherwise make axios serialise the FormData to JSON. Paths are percent-encoded.
  - `errors.ts`: `describeDesignError(error: unknown): string` (codes: `CONFLICT` "Thiết kế đã thay đổi, hãy tải lại.", `PAYLOAD_TOO_LARGE` "Tệp vượt dung lượng cho phép.", `UNSUPPORTED_MEDIA_TYPE` "Định dạng tệp không được hỗ trợ.", `PRODUCT_NOT_CUSTOMIZABLE` "Sản phẩm này không hỗ trợ thiết kế.", `IDEMPOTENCY_KEY_REUSED`, `FORBIDDEN`, `NOT_FOUND`, `DESIGN_API_UNAVAILABLE` "Tính năng này đang chờ backend hỗ trợ"), `isDesignConflict(e)`, `isDesignApiUnavailable(e)`; `api.ts` rethrows a 405, or a 404 from `POST /designs/mine`, as `ApiError(404, "DESIGN_API_UNAVAILABLE", …)`.
  - `capabilities.ts`: `type DesignCapabilities = { selfService: boolean; document: boolean; assets: boolean; reviewRequest: boolean; statusFilter: boolean }`; `designCapabilities(isMock: boolean): DesignCapabilities` — all `true` in mock; in real mode each equals a `PROPOSED_ENDPOINTS_LIVE` constant set to `false` (flip per endpoint when the BE ships it).

- [ ] **Step 1: Write the failing tests** (pattern of `features/catalog/__tests__/api.test.ts`)

```ts
it("lists designs with the BE's 0-based page and the status filter", async () => {
  const get = vi.spyOn(api, "get").mockResolvedValueOnce({ data: bePage([beDraft()]) });
  const page = await listDesigns({ page: 2, size: 12, status: "APPROVED" });
  expect(get).toHaveBeenCalledWith("/designs", {
    params: { page: 1, size: 12, status: "APPROVED" },
  });
  expect(page.page).toBe(2);
});
it("uploads assets as multipart with an idempotency key", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValueOnce({ data: beAsset });
  await uploadDesignAsset("d-1", new Blob(["x"], { type: "image/png" }), "logo.png", "key-1");
  const [url, body, config] = post.mock.calls[0]!;
  expect(url).toBe("/designs/d-1/assets");
  expect(body).toBeInstanceOf(FormData);
  expect(config).toMatchObject({
    headers: { "Content-Type": "multipart/form-data", "Idempotency-Key": "key-1" },
  });
});
it("refuses an oversized document without calling the BE", async () => {
  const put = vi.spyOn(api, "put");
  await expect(saveDesignDocument("d-1", { version: 1, document: hugeDoc })).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
});
it("maps a missing self-service endpoint to DESIGN_API_UNAVAILABLE", async () => {
  vi.spyOn(api, "post").mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "No static resource"));
  await expect(createDesign(validInput)).rejects.toMatchObject({ code: "DESIGN_API_UNAVAILABLE" });
});
it("parses a BE draft without the proposed fields", () => {
  expect(designDraftDtoSchema.parse(beDraft({ sku: undefined }))).toMatchObject({
    status: "DRAFT",
  });
});
it("enables proposed endpoints only in mock mode", () => {
  expect(designCapabilities(true)).toEqual({
    selfService: true,
    document: true,
    assets: true,
    reviewRequest: true,
    statusFilter: true,
  });
  expect(designCapabilities(false).selfService).toBe(false);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/api.test.ts src/features/product-design/__tests__/schemas.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**; delete the old `lifecycle.ts`/`selectors.ts`/`mutations.ts`/`queries.ts` exports from `index.ts` for now (Task 15 recreates them) and delete `components/design-editor.tsx`, `element-panel.tsx`, `variant-recheck.tsx`, `src/components/storefront/design-canvas.tsx`, `canvas-toolbar.tsx`, `preflight-report.tsx` (only the old editor used them — confirm with `pnpm exec tsc --noEmit`). Replace `src/app/(storefront)/design/page.tsx` and `[id]/page.tsx` bodies with a temporary `<ComingSoonPage />` from `@/components/shared` so typecheck stays green until Task 16.
- [ ] **Step 4: Run** the tests, then `pnpm run typecheck` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): design API client and BE contracts`

---

### Task 13: Mock design backend (fixtures)

**Files:**

- Create: `src/lib/api/mock-fixtures/design-templates.ts`, `src/lib/api/mock-fixtures/designs.ts`
- Test: `src/lib/api/mock-fixtures/designs.test.ts`, `src/features/product-design/__tests__/mock-contract.test.ts`

**Interfaces:**

- Produces:
  - `MOCK_DESIGN_TEMPLATES: Record<string /*sku*/, unknown>` — DTO-shaped templates (plain data; `src/lib` must not import the feature). Values (spec §4.1, numbers precomputed, 2 decimals):

| SKU                                         | Model                                                          | Print area(s)                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CUP-PAPER-8OZ-WHT` / `CUP-PAPER-8OZ-KRAFT` | cup 80/56/92, rim 3, seam 8, band 6/8, `paper-white` / `kraft` | BODY sector inner 224.49, outer 303.26, sweep 0.81266, seam 8; bbox 249.57 × 100.35; bleed 2, safe 3 |
| `CUP-PAPER-12OZ-WHT`, `CUP-CUSTOM-LOGO`     | cup 90/60/110, rim 3, seam 8, band 6/8, `paper-white`          | BODY inner 230.04, outer 327.05, sweep 0.84894, seam 8; bbox 279.67 × 120.85                         |
| `CUP-KRAFT-16OZ`                            | cup 90/60/135, rim 3, seam 8, band 6/8, `kraft`                | BODY inner 279.66, outer 401.49, sweep 0.69386, seam 8; bbox 283.77 × 141.32                         |
| `CUP-PET-500ML`                             | cup 95/60/150, rim 3, seam 0, band 10/10, `pet-clear`          | BODY inner 268.89, outer 399.90, sweep 0.72810, seam 0; bbox 284.78 × 148.64                         |
| `BAG-KRAFT-M`                               | bag 260 × 120 × 320, topFold 40, `twisted`, `kraft-brown`      | FRONT/BACK 260 × 280, LEFT/RIGHT 120 × 280; bleed 3, safe 5                                          |
| `BAG-KRAFT-L`                               | bag 320 × 120 × 420, topFold 45, `twisted`, `kraft-brown`      | FRONT/BACK 320 × 375, LEFT/RIGHT 120 × 375; bleed 3, safe 5                                          |

Every template: `minDpi` 150 (PET 200), `colorMode` `CMYK`, formats `["image/png","image/jpeg","image/webp"]`, `maxFileSizeMb` 20, `maxColors` null (bags: 4), `allowedFontCodes` null.

- `createMockDesignStudio(deps: { userId: string; customerId: string; now?: () => number; newId?: () => string; readImageSize?: (blob: Blob) => Promise<{ width: number; height: number }>; toUrl?: (blob: Blob) => string; catalogKindOf?: (slug: string) => { productId: string; kind: "STANDARD" | "CUSTOMIZABLE"; skus: string[] } | undefined }): MockDesignStudio` with methods returning `MockResult` (ApiResponse envelope, like `mock-fixtures/orders.ts`): `list(query)`, `get(id)`, `history(id, query)`, `snapshot(id)`, `create(body)`, `customization(slug)`, `getDocument(id)`, `putDocument(id, body)`, `listAssets(id)`, `uploadAsset(id, file, key)`, `assetLink(id, assetId)`, `listArtifacts(id)`, `uploadArtifact(id, role, file, key)`, `artifactLink(id, artifactId)`, `revise(id, body)`, `requestReview(id, body)`, `submit(id, body)`, `confirm(id, body)`, `requestChanges(id, body)`, `withdraw(id, body)`, `fork(id)`, `completeReview(id, passed: boolean, notes: string)`
- BE rules mirrored (spec §2.2): `version` mismatch → 409 `CONFLICT`; another user's design → 404; document/artifact/spec changes reset `technicalReviewPassed`, `reviewNotes`, `reviewRequestedAt`; `submit` needs passed review + current preview; `confirm` owner-only from SUBMITTED, freezes `{document, checksum, artifacts}` into an immutable snapshot and sets APPROVED; `fork` only from APPROVED; `list` sorts newest first and filters `status`; upload limits 20 MB / allowed types → 413 / 415; same idempotency key + same bytes returns the first result, different bytes → 409 `IDEMPOTENCY_KEY_REUSED`; `customization` → 409 `PRODUCT_NOT_CUSTOMIZABLE` for STANDARD.
- Seed: one APPROVED 12oz design with a snapshot and one DRAFT kraft-bag design for `MOCK_CUSTOMER_ID`.

- [ ] **Step 1: Write the failing tests**

```ts
it("creates, saves with optimistic versions and rejects a stale version", () => {
  const s = studio();
  const d = data(
    s.create({
      productId: P12,
      sku: "CUP-PAPER-12OZ-WHT",
      templateCode: "CUP12-BODY",
      name: "Ly A",
    }),
  );
  expect(data(s.putDocument(d.id, { version: d.version, document: doc })).version).toBe(
    d.version + 1,
  );
  expect(s.putDocument(d.id, { version: d.version, document: doc }).status).toBe(409);
});
it("walks review → submit → confirm → fork", () => {
  const s = studio();
  const d = seededDraftWithPreview(s);
  expect(s.submit(d.id, { version: d.version }).status).toBe(409); // no passed review yet
  s.completeReview(d.id, true, "OK");
  const v = data(s.get(d.id)).version;
  const submitted = data(s.submit(d.id, { version: v }));
  const snap = data(
    s.confirm(d.id, { version: submitted.version, artifactId: submitted.currentArtifactId }),
  );
  expect(data(s.get(d.id)).status).toBe("APPROVED");
  expect(snap.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(data(s.fork(d.id)).parentSnapshotId).toBe(snap.id);
});
it("resets the technical review when the document changes", () => {
  /* completeReview → putDocument → technicalReviewPassed false */
});
it("answers 415 for an SVG upload and replays an idempotent upload", async () => {
  /* … */
});
```

`mock-contract.test.ts` (feature side): every `MOCK_DESIGN_TEMPLATES` value parses with `customizationTemplateSchema`, and every `createMockDesignStudio` response for `list/get/getDocument/listAssets/snapshot` parses with the Task 12 DTO schemas.

- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/api/mock-fixtures/designs.test.ts src/features/product-design/__tests__/mock-contract.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both fixture files (checksum via `globalThis.crypto.subtle` is async — snapshot creation awaits it, so `confirm` is `async` and returns `Promise<MockResult>`; adjust the test with `await`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): mock design backend mirroring BE rules`

---

### Task 14: Mock routes, catalog `kind`, BE change request

**Files:**

- Create: `src/lib/api/mock-design.ts`, `docs/superpowers/specs/2026-10-25-design-api-be-proposal.md`
- Modify: `src/lib/api/mock-routes.ts` (register), `src/lib/api/mock-fixtures/catalog.ts` (`MockProduct.kind`, `detail`/`list` return `kind`; CUSTOMIZABLE for `ly-giay-2-lop-8oz`, `ly-giay-2-lop-12oz`, `ly-nhua-pet-500ml`, `ly-giay-in-logo`, `tui-giay-kraft`, `ly-giay-kraft-16oz`), `src/features/catalog/schemas.ts` (`kind: z.enum(["STANDARD","CUSTOMIZABLE"]).optional()` on product and card DTOs)
- Test: `src/lib/api/mock-design.test.ts`, extend `src/lib/api/mock-fixtures/catalog.test.ts`

**Interfaces:**

- Consumes: Task 13 store.
- Produces: `registerDesignMockRoutes(studio?: MockDesignStudio): void` registering (fixed words before `:id`): `GET /designs`, `POST /designs/mine`, `GET /designs/:id`, `GET /designs/:id/history`, `GET /designs/:id/snapshot`, `GET|PUT /designs/:id/document`, `GET|POST /designs/:id/assets`, `GET /designs/:id/assets/:assetId/download-url`, `GET|POST /designs/:id/artifacts` (role from `params.role`), `GET /designs/:id/artifacts/:artifactId/download-url`, `PUT /designs/:id/specification`, `POST /designs/:id/technical-review-requests` (schedules `completeReview(id, true, "Mock QC: đạt kỹ thuật")` after 2000 ms — comment marks it mock-only), `POST /designs/:id/confirmation-requests | change-requests | confirmation-withdrawals | confirmations | revisions`, `GET /catalog/products/:slug/customization` (registered before the catalog's `/catalog/products/:slug`). Multipart: read `(config.data as FormData).get("file")`; header `Idempotency-Key` from `config.headers`.
- The BE proposal doc restates spec §2.3 G1–G11 and §7.2 P1–P6 with request/response JSON examples, error codes, permission notes (customer `design-designs:CREATE` for P1, `design-designs:UPDATE` for P3–P5), the `status` filter on `GET /designs`, and `customization_templates.model_params_json`.

- [ ] **Step 1: Write the failing tests** — `mock-design.test.ts`: after `registerDesignMockRoutes(studio)`, `api.post("/designs/mine", …)` with the mock adapter active resolves a draft; `api.get("/catalog/products/ly-giay-2-lop-12oz/customization")` resolves templates; a FormData upload stores the asset. `catalog.test.ts`: `detail("tui-giay-kraft")` data has `kind: "CUSTOMIZABLE"`, `detail("nap-ly-90mm")` has `kind: "STANDARD"`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/api/mock-design.test.ts src/lib/api/mock-fixtures/catalog.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**, register in `registerAllMockRoutes()` with `createMockDesignStudio({ userId: <mock auth user id>, customerId: MOCK_CUSTOMER_ID, catalogKindOf: (slug) => catalog lookup })`; write the BE proposal doc.
- [ ] **Step 4: Run** the tests plus `pnpm exec vitest run src/features/catalog` (catalog contract tests stay green) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): mock design routes and catalog kind` and `docs(design): BE change request for the design API`

---

### Task 15: Queries, mutations, lifecycle and autosave

**Files:**

- Create: `src/features/product-design/queries.ts`, `mutations.ts`, `lifecycle.ts`, `autosave.ts`, `selectors.ts` (replacing the old ones)
- Modify: `src/features/product-design/index.ts`
- Test: `__tests__/lifecycle.test.ts`, `__tests__/autosave.test.ts`, `__tests__/mutations.test.tsx`

**Interfaces:**

- Consumes: Task 12 API.
- Produces:
  - `designKeys = { all: ["designs"], lists: () => […, "list"], list: (p) => […, p], details: () => […, "detail"], detail: (id) => […, id], document: (id) => [...detail(id), "document"], assets: (id) => [...detail(id), "assets"], artifacts: (id) => [...detail(id), "artifacts"], history: (id) => [...detail(id), "history"], snapshot: (id) => [...detail(id), "snapshot"], customization: (slug) => ["designs", "customization", slug] }`
  - Hooks: `useDesignList(p)`, `useDesign(id)`, `useDesignDocument(id, enabled)`, `useDesignAssets(id, enabled)`, `useDesignArtifacts(id)`, `useDesignHistory(id)`, `useDesignSnapshot(id, enabled)`, `useCustomization(slug, enabled)`, `useDownloadLink(kind: "asset" | "artifact", designId, id, enabled)` (`staleTime` = time to `expiresAt` − 30 s)
  - Mutations with invalidation per spec §7.4: `useCreateDesign()`, `useUploadAsset(id)`, `useFinalizeDesign(id)` (submit when DRAFT, then confirm with `currentArtifactId`), `useConfirmDesign(id)`, `useRequestChanges(id)`, `useWithdrawConfirmation(id)`, `useForkDesign()`; `invalidateDesign(client, id)` helper used by Task 23's review submission.
  - `lifecycle.ts`: `type DesignUiState = "editing" | "awaitingReview" | "changesRequested" | "reviewPassed" | "awaitingConfirmation" | "confirmed"`; `type DesignAction = "edit" | "requestReview" | "finalize" | "confirm" | "requestChanges" | "withdraw" | "fork" | "requestQuote"`; `deriveUiState(d: DesignDraft): DesignUiState` (precedence of spec §7.5, real-BE fallback without P6); `DESIGN_UI_STATE_META: Record<DesignUiState, { label: string; tone: SemanticTone; editable: boolean; hint: string }>` (labels: "Đang thiết kế", "Chờ QC kiểm tra", "QC yêu cầu sửa", "Đạt kỹ thuật", "Chờ bạn xác nhận", "Đã chốt"; tones neutral, info, warning, positive, warning, positive); `allowedActions(state): readonly DesignAction[]`
  - `autosave.ts`: `type AutosaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict" | "offline"`; `createAutosaver(opts: { save: (doc: DesignDocument, version: number) => Promise<{ version: number; savedAt: string }>; initialVersion: number; delayMs?: number /*1500*/; isOnline?: () => boolean; onChange: (s: { state: AutosaveState; savedAt?: string; version: number }) => void }): { schedule(doc: DesignDocument): void; flush(): Promise<void>; retry(): void; dispose(): void }` — one save in flight; changes during a save are saved afterwards with the returned version; `ApiError` 409 → `conflict` and further `schedule` calls are ignored; offline → `offline`, retried with backoff 2 s, 4 s, 8 s (max 30 s) when back online; other errors → `error` until `retry()`.
  - `selectors.ts`: `designCardView(d: DesignDraft): { title: string; subtitle: string; updatedLabel: string | null; state: DesignUiState }` (dates via `formatDateTime` from `@/lib/format`)

- [ ] **Step 1: Write the failing tests**

```ts
it.each([
  [beDraft({ status: "APPROVED" }), "confirmed"],
  [beDraft({ status: "SUBMITTED" }), "awaitingConfirmation"],
  [beDraft({ technicalReviewPassed: true }), "reviewPassed"],
  [beDraft({ reviewNotes: "Logo mờ" }), "changesRequested"],
  [beDraft({ reviewRequestedAt: T2, updatedAt: T2 }), "awaitingReview"],
  [beDraft({ reviewRequestedAt: T1, updatedAt: T2 }), "editing"],
  [
    beDraft({ currentArtifactId: A1, reviewRequestedAt: undefined, updatedAt: undefined }),
    "awaitingReview",
  ], // real BE fallback
])("derives %s", (draft, state) => expect(deriveUiState(draft)).toBe(state));
it("offers finalize only after review passes and fork only when confirmed", () => {
  expect(allowedActions("reviewPassed")).toContain("finalize");
  expect(allowedActions("editing")).not.toContain("finalize");
  expect(allowedActions("confirmed")).toEqual(expect.arrayContaining(["fork", "requestQuote"]));
});
it("saves changes made during an in-flight save with the new version", async () => {
  vi.useFakeTimers();
  const save = deferredSaves();
  const a = createAutosaver({ save: save.fn, initialVersion: 3, onChange: track });
  a.schedule(d1);
  await vi.advanceTimersByTimeAsync(1500);
  a.schedule(d2);
  save.resolve(0, { version: 4, savedAt: T1 });
  await vi.advanceTimersByTimeAsync(1500);
  expect(save.fn).toHaveBeenNthCalledWith(2, d2, 4);
});
it("stops on 409 and flushes a pending save", async () => {
  /* 409 → state conflict, later schedule ignored; flush() saves immediately */
});
it("finalize submits then confirms and invalidates the design", async () => {
  /* renderHook + spies on api.post */
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/lifecycle.test.ts src/features/product-design/__tests__/autosave.test.ts src/features/product-design/__tests__/mutations.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): design queries, lifecycle and autosave`

---

## Part C — Storefront UI

### Task 16: Routes, design list, new-design launcher, PDP entry

**Files:**

- Create: `src/app/(studio)/layout.tsx`, `src/app/(studio)/design/new/page.tsx`, `src/app/(studio)/design/[id]/page.tsx`, `src/app/(studio)/design/[id]/loading.tsx`, `src/app/(studio)/design/[id]/error.tsx`, `src/app/(studio)/design/fonts.ts`, `src/features/product-design/components/design-status-badge.tsx`, `design-list-screen.tsx`, `design-card.tsx`, `new-design-screen.tsx`
- Delete: `src/app/(storefront)/design/[id]/page.tsx`
- Modify: `src/app/(storefront)/design/page.tsx` (renders `<DesignListScreen />`), `src/constants/routes.ts` (`design.newFor(slug, sku)`), `src/features/catalog/components/product-purchase-panel.tsx` (prop `designHref: string | null` — button hidden when null), `src/features/catalog/components/product-detail-screen.tsx` (passes `STORE_ROUTES.design.newFor(slug, sku)` only when `data.kind === "CUSTOMIZABLE"`)
- Test: `__tests__/design-list-screen.test.tsx`, `__tests__/new-design-screen.test.tsx`, extend `src/features/catalog/__tests__/product-detail-screen.test.tsx`

**Interfaces:**

- Consumes: Tasks 12–15.
- Produces:
  - `fonts.ts`: `next/font/google` instances (subset `vietnamese`, `display: "swap"`) for Be Vietnam Pro, Montserrat, Roboto Slab, Playfair Display, Oswald, Dancing Script, Lobster, Pacifico; `STUDIO_FONTS: FontRegistry` with codes `be-vietnam-pro`, `montserrat`, `roboto-slab`, `playfair-display`, `oswald`, `dancing-script`, `lobster`, `pacifico` (`family = instance.style.fontFamily`; `italic` true only where the family ships italics).
  - `(studio)/layout.tsx`: full-height `bg-bg-subtle` container, no storefront header/footer.
  - `DesignStatusBadge({ state }: { state: DesignUiState })` — same pattern as `features/order/components/order-status-badge.tsx`, tone from `DESIGN_UI_STATE_META`.
  - `DesignListScreen()` — `nuqs` `tab` (`all | editing | waiting | confirmed`, maps to BE status `undefined | DRAFT | SUBMITTED | APPROVED`) and `page` (resets to 1 on tab change); tabs hidden when `!capabilities.statusFilter`; skeleton grid; empty "Bạn chưa có thiết kế nào" with a link to `/catalog`; empty "Không có thiết kế ở mục này" for a tab; error with retry; `DesignCard` shows the preview thumbnail (`useDownloadLink("artifact", …previewArtifactId)`), badge, product/SKU, updated time, "Mở thiết kế".
  - `NewDesignScreen({ product, sku }: { product: string; sku: string | null })` — loads `useCustomization`, picks the template of `sku` (select shown when the variant has several), default name `"{title} – dd/MM"`, calls `useCreateDesign`, then `router.replace(STORE_ROUTES.design.detail(id))`; unavailable state when `!capabilities.selfService`; signed-out → redirect to login like `ProductDetailScreen`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lists designs with status badges and resets the page on tab change", async () => {
  fakeDesigns([approved, draft]); const onUrlUpdate = vi.fn();
  renderWithProviders(<DesignListScreen />, { searchParams: "?page=2", onUrlUpdate });
  expect(await screen.findByText("Đã chốt")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Đã chốt" }));
  expect(onUrlUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ queryString: expect.not.stringContaining("page=2") }));
});
it("shows the two different empty states", async () => { /* no designs → link to catalog; tab empty → 'Không có thiết kế ở mục này' */ });
it("creates a design from the PDP link and opens the studio", async () => {
  renderWithProviders(<NewDesignScreen product="ly-giay-2-lop-12oz" sku="CUP-PAPER-12OZ-WHT" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/design\/.+/)));
});
it("shows 'Bắt đầu thiết kế' only for customizable products", async () => { /* kind CUSTOMIZABLE → link with ?product&sku; STANDARD → no link */ });
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/design-list-screen.test.tsx src/features/product-design/__tests__/new-design-screen.test.tsx src/features/catalog/__tests__/product-detail-screen.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; `(studio)/design/[id]/page.tsx` renders a placeholder `DesignStudio` import that Task 17 provides (create `components/studio/design-studio.tsx` exporting a stub returning the loading skeleton so the route builds).
- [ ] **Step 4: Run** the tests and `pnpm run build` (route groups `(storefront)/design` and `(studio)/design/{new,[id]}` coexist) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(design): design list, launcher and PDP entry`

---

### Task 17: Studio shell, canvas stage and 3D viewer host

**Files:**

- Create (`src/features/product-design/components/studio/`): `design-studio.tsx`, `studio-context.tsx`, `studio-header.tsx`, `surface-tabs.tsx`, `canvas-stage.tsx`, `use-surface-renderer.ts`, `viewer-host.tsx`, `flat-preview.tsx`, `use-editor.ts`, `use-autosave.ts`, `use-asset-images.ts`, `studio-announcer.tsx`, `studio-skeleton.tsx`
- Modify: `src/app/(studio)/design/[id]/page.tsx` (dynamic import `DesignStudio` with `ssr: false`, `loading: StudioSkeleton`, passes `STUDIO_FONTS`)
- Add primitives: `pnpm dlx shadcn@latest add tabs toggle-group`
- Test: `__tests__/design-studio.test.tsx`

**Interfaces:**

- Consumes: engine (`createEditor`, `createSurfaces`, `compose`, `renderSurface`, `ImageCache`, `createCanvasMeasurer`, `createSizer`, `ProductViewer`, `isWebGLAvailable`), Tasks 15–16.
- Produces:
  - `type StudioServices = { editor: EditorController; template: CustomizationTemplate; surfaces: SurfaceSet; sizer: ElementSizer; fonts: FontRegistry; measure: TextMeasurer; images: ImageCache; assets: ReadonlyMap<string, DesignAsset>; design: DesignDraft; capabilities: DesignCapabilities; uiState: DesignUiState }`; `StudioProvider`, `useStudio(): StudioServices`, `useEditorState<T>(selector: (s: EditorState) => T): T`
  - `DesignStudio({ designId, fonts }: { designId: string; fonts: FontRegistry })` — loads design, document, template (via customization of the design's product + `sku`/`templateCode`), assets; states: skeleton, `DESIGN_API_UNAVAILABLE` ("Tính năng này đang chờ backend hỗ trợ" + link back to `/design`), not found, error with retry; read-only when `!DESIGN_UI_STATE_META[uiState].editable`.
  - `StudioHeader` — back link "Thiết kế của tôi", inline-editable name (local only in v1), save state text (exact copy, `Đã lưu lúc HH:mm` via `formatTime`), undo/redo buttons (disabled per `canUndo`/`canRedo`, labels "Hoàn tác (Ctrl+Z)", "Làm lại (Ctrl+Shift+Z)"), `DesignStatusBadge`, slot for the primary lifecycle action (Task 23).
  - `SurfaceTabs` — Radix tabs of `surfaces.order` (cup: "Thân ly"; bag: "Mặt trước", "Mặt sau", "Hông trái", "Hông phải"); switching calls `setActiveSurface` and `viewer.focusSurface`.
  - `CanvasStage` — renders the active surface with `target: "editor"` at `fitScale × zoom × devicePixelRatio` via `requestAnimationFrame` on `onDocumentChange`/zoom changes; zoom controls ("Thu nhỏ", "Phóng to", "Vừa khung", percentage); `role="img"` with `aria-label` "Bản thiết kế {surface name}, {n} phần tử".
  - `useSurfaceRenderer({ surfaces, editor, onTexture(code, canvas) })` — per-surface offscreen texture canvases; dirty surfaces recomposed at 1024 px while `interacting`, 2048 px after 150 ms idle.
  - `ViewerHost` — mounts `ProductViewer` when `isWebGLAvailable()`, wires textures, toolbar ("Tự xoay", "Đặt lại góc nhìn", "Toàn màn hình"), click → `pick` → select element on that surface via `hitTest`; on unavailability, `contextlost` or `setModel` error renders `FlatPreview` (active surface `preview` composite + gallery image) with "Preview 3D không khả dụng"; the disclaimer paragraph is always rendered below.
  - `useAutosave(design, editor)` — wraps `createAutosaver` with `saveDesignDocument`, flushes on `visibilitychange` hidden and unmount, `beforeunload` guard while `pending | saving`, sets query data on success.
  - `useAssetImages(designId, document)` (`use-asset-images.ts`) — for every `assetId` in the document: `useDownloadLink("asset", …)` → `fetch` → `ImageCache.load(…, "proxy")`; on a failed fetch requests a fresh link once, then marks the asset `status: "error"` (placeholder tile + `ASSET_INVALID`); returns the `assets` status map that preflight consumes; re-renders the affected surfaces when an image arrives.
  - `StudioAnnouncer` + `announce(message: string)` on `StudioServices` — one polite `aria-live` region; messages "Đã thêm ảnh", "Đã thêm chữ", "Đã xoá phần tử", "Đã lưu", "Kiểm tra: {n} lỗi, {m} cảnh báo".
  - Desktop grid: `lg:grid-cols-[3.5rem_17.5rem_minmax(0,1fr)_minmax(22rem,38%)]`, full viewport height minus the header.

- [ ] **Step 1: Write the failing tests** (fake backend over the Task 13 store; jsdom has no WebGL)

```ts
it("opens a draft with the cup surface and the 3D fallback", async () => {
  renderWithProviders(<DesignStudio designId={DRAFT_CUP} fonts={TEST_FONTS} />);
  expect(await screen.findByRole("tab", { name: "Thân ly" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Preview 3D không khả dụng")).toBeInTheDocument();
  expect(screen.getByText("Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật")).toBeInTheDocument();
});
it("shows the unavailable state when the document endpoint is not live", async () => { /* capabilities.document false → copy + link */ });
it("is read-only for a confirmed design", async () => { /* APPROVED → undo disabled, banner 'Tạo phiên bản mới' */ });
it("autosaves and shows the saved time", async () => { /* editor.apply via test hook → after 1500 ms 'Đã lưu lúc' */ });
it("refetches an expired asset link once, then shows the placeholder issue", async () => { /* first fetch 403 → new download-url requested → second 403 → preflight lists 'Ảnh không hợp lệ hoặc không tải được.' */ });
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/design-studio.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; then `preview_start` the dev server with `USE_MOCK=true`, open `/design/<seeded draft id>`, verify the cup renders in 3D, rotates, and the 2D dieline shows bleed/trim/safe/seam guides; screenshot.
- [ ] **Step 5: Commit** `feat(design): studio shell with 2D stage and 3D preview`

---

### Task 18: Selection, transform overlay, layers and common properties

**Files:**

- Create (`components/studio/`): `interaction-overlay.tsx`, `use-stage-pointer.ts`, `layers-panel.tsx`, `properties-panel.tsx`, `side-panel.tsx`, `tool-rail.tsx`, `use-studio-shortcuts.ts`, `read-only-banner.tsx`
- Test: `__tests__/studio-selection.test.tsx`

**Interfaces:**

- Consumes: engine `hitTest`, `elementOutline`, `elementMatrix`, `clampPlacement`, `snapPlacement`, `surfaceSnapTargets`, `resolveShortcut`, commands.
- Produces:
  - `ToolRail` — buttons V/U/T/B/E/G with labels "Chọn (V)", "Ảnh/Logo (U)", "Chữ (T)", "Vẽ (B)", "Tẩy (E)", "Nền (G)", `aria-pressed` for the active tool, disabled when read-only (except Chọn).
  - `InteractionOverlay` — SVG over the canvas in screen px: outline polygon of the selected element, 4 corner scale handles, rotate handle; pointer gestures call `editor.apply(updateElement…, { gestureId })` once per frame; move uses `fromFlat` + `snapPlacement` (2 mm) + `clampPlacement` and draws snap guide lines; scale keeps ratio unless Shift; rotate snaps 15° with Shift; locked elements show the outline without handles.
  - `useStudioShortcuts(stageRef)` — keydown on the stage container only (ignored inside inputs/textarea/contenteditable); nudge converts mm along the local upright.
  - `LayersPanel` — `role="listbox"` of the active surface's elements topmost-first ("Ảnh", "Chữ: {content}", "Nét vẽ n"); arrows move selection, Enter starts editing (text) , Delete removes; per-row buttons "Ẩn/Hiện", "Khoá/Mở khoá", drag handle replaced by "Đưa lên"/"Đưa xuống" buttons (keyboard-accessible reorder).
  - `PropertiesPanel` — common fields for the selection: X/Y (u, v mm), rotation (°), scale (%), opacity (%), buttons "Nhân bản", "Xoá", "Căn giữa ngang", "Căn giữa dọc", "Sao chép sang mặt khác" (bag only); type-specific sections are slots filled by Tasks 19–21.
  - `SidePanel` — tabs "Thuộc tính" | "Lớp" | "Kiểm tra" (Kiểm tra content in Task 23).
  - `ReadOnlyBanner({ state })` — explains why and offers "Rút yêu cầu để chỉnh sửa" (awaitingConfirmation) or "Tạo phiên bản mới" (confirmed).

- [ ] **Step 1: Write the failing tests**

```ts
it("selects from the layers list and deletes with the keyboard", async () => {
  await openStudio(docWith(["logo", "text"]));
  await userEvent.click(screen.getByRole("option", { name: /Chữ: Cà phê/ }));
  await userEvent.keyboard("{Delete}");
  expect(screen.queryByRole("option", { name: /Chữ: Cà phê/ })).not.toBeInTheDocument();
});
it("undoes a deletion with Ctrl+Z", async () => {
  /* … option returns */
});
it("nudges with arrows but never past the surface edge", async () => {
  await openStudio(docWith(["logo-at-left-edge"]));
  selectLayer("Ảnh");
  focusStage();
  await userEvent.keyboard("{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}");
  expect(screen.getByLabelText("X (mm)")).toHaveValue(0);
});
it("edits rotation and opacity from the properties panel", async () => {
  /* type 15 → rotation 15; opacity 50 */
});
it("disables editing tools when read-only", async () => {
  /* confirmed → 'Chữ (T)' disabled, banner action 'Tạo phiên bản mới' */
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/studio-selection.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; in the browser preview drag/scale/rotate a logo on the cup and confirm the 3D logo stays upright while moving around the cup; screenshot.
- [ ] **Step 5: Commit** `feat(design): selection handles, layers and properties`

---

### Task 19: Image/logo tool

**Files:**

- Create (`components/studio/`): `image-tool-panel.tsx`, `use-asset-upload.ts`, `image-properties.tsx`; engine helpers `engine/assets/image-header.ts`, `engine/assets/svg.ts`
- Test: `engine/__tests__/assets.test.ts` (node), `__tests__/image-tool.test.tsx`

**Interfaces:**

- Consumes: Task 12 `uploadDesignAsset`, Task 15 `useUploadAsset`, engine `effectiveDpi`, `addElement`.
- Produces:
  - `readImageDimensions(bytes: Uint8Array): { width: number; height: number; type: "image/png" | "image/jpeg" | "image/webp" } | null` (PNG IHDR, JPEG SOFn markers, WebP VP8/VP8L/VP8X)
  - `svgIntrinsicSize(svgText: string): { width: number; height: number }` (width/height attributes in px/mm/pt/cm/in, else viewBox, else 2000 × 2000 keeping viewBox ratio)
  - `rasterizeSvg(svgText: string, targetWidthPx: number): Promise<Blob>` (browser: `<img src=blob:>` → canvas → PNG; target width = print size at 300 DPI of 60 % of the active surface width, min 2000 px)
  - `useAssetUpload()` → `upload(file: File): Promise<DesignAsset>` — validation order: type in `template.allowedFileFormats` or `image/svg+xml`; size ≤ `maxFileSizeMb`; header dims present and ≤ 40 000 000 px; SVG rasterised first; idempotency key = SHA-256 of the bytes; errors shown with `describeDesignError` / specific copy ("Ảnh vượt 40 megapixel.", "Không đọc được kích thước ảnh.", "Tệp lớn hơn {n} MB.", "Định dạng không được hỗ trợ. Hỗ trợ: PNG, JPG, WebP, SVG.")
  - `ImageToolPanel` — dropzone ("Kéo thả hoặc chọn ảnh", input `accept` from template + `.svg`), paste listener on the stage, "Ảnh đã tải lên" grid of `useDesignAssets`; picking an asset adds an image element at the surface centre, sized to fit 60 % of the safe width keeping aspect.
  - `ImageProperties` — DPI badge ("{dpi} DPI ✓" positive / "{dpi} DPI – sẽ mờ" warning or danger by Task 7 thresholds), "Lật ngang", "Lật dọc", "Vừa vùng an toàn", "Uốn theo thân ly" switch (cup only), "Thay ảnh".

- [ ] **Step 1: Write the failing tests**

```ts
// engine/__tests__/assets.test.ts (node)
it("reads PNG, JPEG and WebP dimensions from headers", () => {
  expect(readImageDimensions(PNG_9000)).toEqual({ width: 9000, height: 9000, type: "image/png" });
  expect(readImageDimensions(JPEG_640x480)).toMatchObject({ width: 640, height: 480 });
  expect(readImageDimensions(WEBP_VP8X_1200x800)).toMatchObject({ width: 1200, height: 800 });
  expect(readImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
});
it("sizes an SVG from attributes, then viewBox, then a default", () => {
  expect(svgIntrinsicSize('<svg width="120mm" height="60mm"/>')).toEqual({
    width: expect.closeTo(453.54, 1),
    height: expect.closeTo(226.77, 1),
  });
  expect(svgIntrinsicSize('<svg viewBox="0 0 400 100"/>')).toEqual({ width: 400, height: 100 });
  expect(svgIntrinsicSize("<svg/>")).toEqual({ width: 2000, height: 2000 });
});
// __tests__/image-tool.test.tsx
it("refuses a 9000 × 9000 PNG with a message", async () => {
  /* upload → 'Ảnh vượt 40 megapixel.', no api.post */
});
it("uploads a PNG and places it centred with a DPI badge", async () => {
  /* layer 'Ảnh' appears; badge text matches /DPI/ */
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/engine/__tests__/assets.test.ts src/features/product-design/__tests__/image-tool.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests; in the browser upload a PNG and an SVG logo, check the 3D texture updates; screenshot.
- [ ] **Step 5: Commit** `feat(design): image and logo tool`

---

### Task 20: Text tool

**Files:**

- Create (`components/studio/`): `text-tool-panel.tsx`, `text-edit-overlay.tsx`, `text-properties.tsx`, `font-combobox.tsx`, `color-field.tsx`, `use-font-status.ts`
- Test: `__tests__/text-tool.test.tsx`

**Interfaces:**

- Consumes: engine `layoutText`, `PRINT_SWATCHES`, commands; Task 16 `FontRegistry`.
- Produces:
  - `TextToolPanel` — "Thêm chữ" adds `{ content: "Nhập chữ", fontCode: first allowed, sizePt: 24, color: "#111111", align: "center", lineHeight: 1.2, letterSpacingEm: 0 }` at the surface centre and opens inline editing; presets "Tiêu đề" (48 pt bold), "Phụ đề" (24 pt), "Ghi chú" (12 pt).
  - `TextEditOverlay` — `<textarea aria-label="Nội dung chữ">` positioned with the element's CSS matrix; Enter inserts a newline, Escape and blur commit (one history step per editing session); an empty or whitespace-only result removes the element.
  - `TextProperties` — `FontCombobox` (shadcn Command + Popover, items rendered in their own family, filtered by `allowedFontCodes`), size (pt, 6–200), `ColorField`, align toggle group, bold/italic (italic disabled when the font has none), outline (colour + width mm), letter spacing (em), line height, "Uốn theo thân ly" switch (cup only).
  - `ColorField({ value, onChange, label, warnOnKraft?: boolean })` — swatches from `PRINT_SWATCHES` + 6 most recent (session) + hex input (`#RRGGBB`); warning text "Giấy kraft không in được màu trắng." when `warnOnKraft` and luminance > 0.92.
  - `useFontStatus(codes)` → `Record<string, "ready" | "loading" | "error">` via `document.fonts.load` (feeds preflight); when a font turns `ready` every surface using it is re-rendered (editor canvas and 3D textures), so text never stays drawn in the fallback font.

- [ ] **Step 1: Write the failing tests**

```ts
it("adds text, edits it inline and commits on Escape", async () => {
  await openStudio(emptyCupDoc);
  await userEvent.click(screen.getByRole("button", { name: "Chữ (T)" }));
  await userEvent.click(screen.getByRole("button", { name: "Thêm chữ" }));
  const box = screen.getByRole("textbox", { name: "Nội dung chữ" });
  await userEvent.clear(box);
  await userEvent.type(box, "Cà phê Sữa Đá{Escape}");
  expect(screen.getByRole("option", { name: "Chữ: Cà phê Sữa Đá" })).toBeInTheDocument();
});
it("removes a text committed empty", async () => {
  /* clear + Escape → no 'Chữ:' option */
});
it("offers only allowed fonts and disables italic for Lobster", async () => {
  /* template allowedFontCodes ['lobster','montserrat'] */
});
it("warns about white on kraft", async () => {
  /* kraft template, pick #FFFFFF → warning copy */
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/text-tool.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; in the browser add a wide text with "Uốn theo thân ly" on the 12oz cup and confirm it reads horizontally in 3D; screenshot.
- [ ] **Step 5: Commit** `feat(design): text tool with inline editing`

---

### Task 21: Brush, eraser and background tools

**Files:**

- Create (`components/studio/`): `brush-tool-panel.tsx`, `use-brush-gesture.ts`, `background-tool-panel.tsx`
- Add primitive: `pnpm dlx shadcn@latest add slider`
- Test: `__tests__/brush-background.test.tsx`

**Interfaces:**

- Consumes: engine `appendStroke`, `addElement`, `setBackground`, `setBackgroundAll`, `simplifyRdp`, `elementMatrix` (inverse for local coords), `PATTERN_IDS`.
- Produces:
  - `useBrushGesture(stageRef)` — pointer down on the stage with tool brush/eraser: target drawing = selected `drawing` element, else a new one named "Nét vẽ {n}" with placement = `fromFlat(first point)`; points converted to drawing-local mm through the inverse element matrix, pressure from `PointerEvent.pressure` (0.5 when the pointer has none); live preview updates the canvas and 1024 px texture each frame; on pointer up the stroke is simplified (RDP 0.1 mm) and committed with one `gestureId`; eraser on a surface with no drawing does nothing. Single-finger touch draws; two-finger gestures are left to the stage zoom/pan.
  - `BrushToolPanel` — size slider 0.5–20 mm ("Cỡ bút"), `ColorField`, opacity slider; eraser shows only "Cỡ tẩy".
  - `BackgroundToolPanel` — radio cards "Không nền", "Màu", "Hoạ tiết"; colour via `ColorField`; pattern grid of `PATTERN_IDS` previews (rendered with the engine `drawPattern` on small canvases), two colours, scale slider 2–40 mm, rotation 0–180°; bag only: "Áp dụng cho mọi mặt".

- [ ] **Step 1: Write the failing tests**

```ts
it("draws a stroke into a new drawing layer as one undo step", async () => {
  await openStudio(emptyBagDoc);
  await pickTool("Vẽ (B)");
  drawOnStage([
    [100, 100],
    [140, 120],
    [180, 160],
  ]); // pointer events on the stage
  expect(screen.getByRole("option", { name: "Nét vẽ 1" })).toBeInTheDocument();
  await userEvent.keyboard("{Control>}z{/Control}");
  expect(screen.queryByRole("option", { name: "Nét vẽ 1" })).not.toBeInTheDocument();
});
it("sets a pattern background on every bag face", async () => {
  /* 'Hoạ tiết' → 'Chấm bi' → 'Áp dụng cho mọi mặt' → each surface tab shows background state */
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/brush-background.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; in the browser draw with a pen/mouse, erase part of it (a logo below stays intact), set a stripes background on the bag; screenshot.
- [ ] **Step 5: Commit** `feat(design): brush, eraser and background tools`

---

### Task 22: Mobile layout

**Files:**

- Create (`components/studio/`): `view-mode-switch.tsx`, `mobile-tool-bar.tsx`, `mobile-sheets.tsx`
- Modify: `design-studio.tsx` (layout below `lg`)
- Test: `__tests__/studio-mobile.test.tsx`

**Interfaces:**

- Produces:
  - `ViewModeSwitch` — toggle group "2D" | "3D" | "Chia đôi" (local `useState`; default "Chia đôi" on ≥ 640 px wide, "2D" below).
  - `MobileToolBar` — fixed bottom bar with the six tools + "Thuộc tính" + "Kiểm tra" (badge with the preflight issue count); every button `size-11`.
  - `MobileSheets` — shadcn `Sheet` (side bottom) for the active tool panel, properties and preflight; opening one closes the others.
  - Stage gestures: two-pointer pinch zoom and pan (`touch-action: none` on the stage), one pointer = tool action.

- [ ] **Step 1: Write the failing tests** — with `window.matchMedia` mocked to mobile: the 6 tool buttons and "Thuộc tính" render in the bottom bar; tapping "Chữ (T)" opens a sheet containing "Thêm chữ"; "3D" hides the 2D stage (`role="img"` gone).
- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/studio-mobile.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; in the browser at 375 × 812 (`resize_window` preset mobile) check no horizontal scroll, sheets open, pinch zoom works; then reset to desktop; screenshot.
- [ ] **Step 5: Commit** `feat(design): mobile studio layout`

---

### Task 23: Preflight panel, review submission and workflow actions

**Files:**

- Create (`components/studio/`): `preflight-panel.tsx`, `use-preflight.ts`, `workflow-card.tsx`, `primary-action.tsx`, `review-submit-dialog.tsx`, `use-review-submission.ts`, `finalize-dialog.tsx`, `change-request-dialog.tsx`, `conflict-dialog.tsx`, `confirmed-card.tsx`
- Test: `__tests__/workflow.test.tsx`

**Interfaces:**

- Consumes: engine `runPreflight`, `compose`, `renderSurface`, `buildPrintPdf`, `buildSheetPdf`, `drawSpecSheet`, `buildSpecSummary`, `specText`, `documentChecksum`, `ProductViewer.screenshot`; Task 12/15 API and mutations.
- Produces:
  - `usePreflight()` → `PreflightReport` recomputed 300 ms after document/asset/font changes.
  - `PreflightPanel` — summary chip ("Đạt" / "{n} cảnh báo" / "{n} lỗi"), issues grouped by surface; clicking an issue selects its element, switches the surface tab and focuses the 3D view; also shows the QC `reviewNotes` when present.
  - `useReviewSubmission(design)` → `{ run(): Promise<void>; step: "idle" | "preview" | "print" | "spec" | "upload" | "request" | "done" | "error"; error?: unknown; retry(): Promise<void> }` — flushes autosave; preview PNG 1600² (viewer screenshot or flat preview); `PRINT_READY` PDF (each surface `target: "print"` at `max(minDpi, 300)` DPI incl. bleed, cut path = `surface.outline("trim")`); `TECHNICAL_SPEC` sheet PDF; uploads with idempotency keys = SHA-256 of each file (a retry reuses finished uploads); `PUT /specification` with `specText`; `POST /technical-review-requests`; `invalidateDesign`.
  - `ReviewSubmitDialog` — blocked with the Fail list when the report has a Fail ("Sửa các lỗi trước khi gửi kiểm tra."); otherwise a step list with `Progress` and "Thử lại" on error.
  - `PrimaryAction` (header slot) by `allowedActions(uiState)`: "Gửi QC kiểm tra" | (awaitingReview) disabled "Đang chờ QC" | "Chốt thiết kế" | "Xác nhận thiết kế" | "Yêu cầu báo giá".
  - `FinalizeDialog` — when the report has Warnings, a required checkbox "Tôi đã xem các cảnh báo và chấp nhận rủi ro khi in"; runs `useFinalizeDesign`.
  - `ChangeRequestDialog` — reason textarea (react-hook-form + `changeReasonInputSchema`) for "Yêu cầu sửa" and "Rút lại".
  - `ConflictDialog` — title "Thiết kế đã thay đổi ở nơi khác", actions "Tải lại" (refetch + `replaceDocument`) and "Tải bản sao JSON" (downloads the local document).
  - `ConfirmedCard` — snapshot id with a "Sao chép mã" button, "Yêu cầu báo giá" link to `STORE_ROUTES.chat.list`, "Tạo phiên bản mới" (`useForkDesign` → navigate).
  - `WorkflowCard` — `DESIGN_UI_STATE_META[uiState].hint` + the actions available in the side column.

- [ ] **Step 1: Write the failing tests**

```ts
it("locates a preflight issue on click", async () => {
  /* low-DPI image on BACK → click issue → tab 'Mặt sau' selected, layer selected */
});
it("blocks review submission while preflight fails", async () => {
  /* empty design → 'Thiết kế chưa có nội dung.' + no api.post */
});
it("submits for review: three artifacts, spec, then the review request", async () => {
  await openStudio(cleanCupDoc);
  await userEvent.click(screen.getByRole("button", { name: "Gửi QC kiểm tra" }));
  await userEvent.click(screen.getByRole("button", { name: "Gửi" }));
  await waitFor(() =>
    expect(roles(apiPostCalls())).toEqual(["CUSTOMER_PREVIEW", "PRINT_READY", "TECHNICAL_SPEC"]),
  );
  expect(lastPut().url).toMatch(/\/specification$/);
  expect(lastPost().url).toMatch(/technical-review-requests$/);
});
it("finalizes with the risk checkbox when warnings exist, then shows the confirmed card", async () => {
  /* reviewPassed + DPI_LOW → checkbox required → snapshot id + 'Sao chép mã' */
});
it("shows the conflict dialog on 409 and reloads", async () => {
  /* putDocument 409 → dialog title → 'Tải lại' */
});
```

Export rendering in jsdom: inject `exportRenderer` through `StudioServices` (default uses real canvases) so the test supplies PNG bytes; the hook's orchestration is what is tested.

- [ ] **Step 2: Run** `pnpm exec vitest run src/features/product-design/__tests__/workflow.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test; in the browser (mock) run the full flow: design → "Gửi QC kiểm tra" → wait for mock QC → "Chốt thiết kế" → confirmed card → "Tạo phiên bản mới"; download the PRINT_READY artifact link and check page size and cut path in a PDF viewer; screenshot.
- [ ] **Step 5: Commit** `feat(design): preflight panel and design workflow`

---

### Task 24: Final verification

**Files:** none new (fixes only).

- [ ] **Step 1:** `pnpm run validate` — Expected: typecheck, lint, all tests and build pass.
- [ ] **Step 2:** `pnpm exec vitest run --coverage` — Expected: `src/features/product-design/engine/{document,geometry,surfaces,preflight,render,export}` ≥ 90 % lines; `schemas.ts`, `lifecycle.ts`, `selectors.ts` ≥ 90 %.
- [ ] **Step 3:** Import boundary check: `rg -n "from \"(react|next/|@/components|@/lib/api)" src/features/product-design/engine` — Expected: no output. `rg -n "mock-data" src --glob '!src/lib/api/mock-adapter.ts' --glob '!src/lib/mock-data.ts'` — Expected: no output.
- [ ] **Step 4:** Browser pass against spec §1 success criteria 1–9 at desktop, 375 px and dark mode (`resize_window` colorScheme dark); with `USE_MOCK=false` against the real BE, confirm criterion 11 (list works, studio/launcher show "Tính năng này đang chờ backend hỗ trợ"). Record any blocker explicitly.
- [ ] **Step 5: Commit** fixes, if any: `fix(design): <what>`.
