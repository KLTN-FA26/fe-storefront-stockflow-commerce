import { applyToPoint, multiply, type Mat2D } from "../geometry/affine";
import type { Ctx2D } from "../render/execute";
import { parseCssColor, type Rgba } from "./css-color";

/** A glyph outline command in text units: y down, origin at the start of the baseline. */
export type GlyphCmd =
  | { c: "M" | "L"; x: number; y: number }
  | { c: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: "Z" };

/** A line of text as outlines, in the units of the font string's px size, and how far it advances. */
export type TextOutline = { commands: GlyphCmd[]; advance: number };

/**
 * The outlines of `text` set in a canvas `font` string with `letterSpacing` (same units) after each
 * glyph, or `null` when a glyph has no outline to give (the page is then rasterised instead).
 */
export type GlyphOutliner = (
  text: string,
  font: string,
  letterSpacing: number,
) => TextOutline | null;

/**
 * What a recorded page draws: PDF content operators in page space (pt, y up) and the resources they
 * name: `/VCs` (the sRGB colour space), `/VGs<i>` (the alpha of `alphas[i]`), `/VIm<i>` (`images[i]`)
 * and `/VL<i>` (the optional-content layer `layers[i]`). An underlay recording names `/VWh` (the
 * `White` separation), `/VWg<i>` and `/VMk<i>` instead: `images[i]` is then a picture whose alpha is
 * the shape of white ink under it.
 */
export type VectorArt = {
  content: string;
  images: CanvasImageSource[];
  alphas: number[];
  layers: string[];
  /** Why the page cannot be drawn as vectors (a composite, a pattern fill, a glyph without outline). */
  unsupported?: string;
};

/** Coordinates and colours are written to 1/10000: exact for print, short in the stream. */
const n = (value: number) => String(Math.round(value * 1e4) / 1e4);
const TAU = Math.PI * 2;
const JOINS: Record<string, number> = { miter: 0, round: 1, bevel: 2 };

type State = {
  m: Mat2D;
  fill: unknown;
  stroke: unknown;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  alpha: number;
  composite: GlobalCompositeOperation;
  font: string;
  letterSpacing: string;
};

const sizeOf = (source: CanvasImageSource): [number, number] => {
  const s = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    width?: unknown;
    height?: unknown;
  };
  const w = s.naturalWidth || (typeof s.width === "number" ? s.width : 0);
  const h = s.naturalHeight || (typeof s.height === "number" ? s.height : 0);
  return [w, h];
};

/**
 * `art` draws the artwork in its colours; `underlay` draws the same shapes in 100 % `White` (a spot
 * ink printed under the colours on clear or dark stock), each at its element's opacity, and every
 * image as the shape of its alpha.
 */
export type RecordMode = "art" | "underlay";

const NAMES: Record<RecordMode, { space: string; state: string; image: string }> = {
  art: { space: "VCs", state: "VGs", image: "VIm" },
  underlay: { space: "VWh", state: "VWg", image: "VMk" },
};

/**
 * A recording 2D context that writes PDF instead of pixels, so the studio's own executor draws the
 * print file: paths, fills, clips and strokes stay vectors, text becomes glyph outlines, images and
 * the executor's raster layers become image XObjects. `base` maps the canvas's units to the page
 * (pt, y up). Anything a PDF cannot say the same way is noted in `unsupported`, never guessed.
 */
export function createPdfCanvas(base: Mat2D, outline: GlyphOutliner, mode: RecordMode = "art") {
  const names = NAMES[mode];
  const out: string[] = [];
  const images: CanvasImageSource[] = [];
  const alphas: number[] = [];
  const layers: string[] = [];
  let unsupported: string | undefined;
  const fail = (reason: string) => (unsupported ??= reason);

  let s: State = {
    m: base,
    fill: "#000000",
    stroke: "#000000",
    lineWidth: 1,
    lineJoin: "miter",
    alpha: 1,
    composite: "source-over",
    font: "10px sans-serif",
    letterSpacing: "0px",
  };
  const stack: State[] = [];
  let path: string[] = [];
  let current: [number, number] | null = null;
  let start: [number, number] | null = null;

  const pt = (x: number, y: number, m = s.m): [number, number] => {
    const p = applyToPoint(m, { x, y });
    return [p.x, p.y];
  };
  const moveTo = (x: number, y: number) => {
    current = start = pt(x, y);
    path.push(`${n(current[0])} ${n(current[1])} m`);
  };
  const lineTo = (x: number, y: number) => {
    if (current === null) return moveTo(x, y);
    current = pt(x, y);
    path.push(`${n(current[0])} ${n(current[1])} l`);
  };
  const curveTo = (...p: [number, number, number, number, number, number]) => {
    const [a, b, c] = [pt(p[0], p[1]), pt(p[2], p[3]), pt(p[4], p[5])];
    path.push(`${[...a, ...b, ...c].map(n).join(" ")} c`);
    current = c;
  };

  const gs = (alpha: number) => {
    let i = alphas.indexOf(alpha);
    if (i < 0) i = alphas.push(alpha) - 1;
    return `/${names.state}${i} gs`;
  };
  const colour = (style: unknown): Rgba | null => {
    const rgba = typeof style === "string" ? parseCssColor(style) : null;
    if (rgba === null)
      fail(`a ${typeof style === "string" ? `colour "${style}"` : "pattern"} fill`);
    return rgba;
  };
  const scaleOf = () => Math.sqrt(Math.abs(s.m[0] * s.m[3] - s.m[1] * s.m[2]));
  const paintable = () => {
    if (s.composite !== "source-over") fail(`the ${s.composite} composite`);
    return unsupported === undefined;
  };

  /** Fills or strokes `segments` (page space) in `style` with the current alpha, state kept apart. */
  const paint = (segments: string[], style: unknown, op: "f" | "f*" | "S") => {
    const rgba = colour(style);
    if (!paintable() || rgba === null || segments.length === 0) return;
    const [r, g, b, a] = rgba;
    const set = op === "S" ? "SC" : "sc";
    const space = op === "S" ? `/${names.space} CS` : `/${names.space} cs`;
    const tint = mode === "underlay" ? "1" : `${n(r)} ${n(g)} ${n(b)}`;
    const line =
      op === "S" ? [`${n(s.lineWidth * scaleOf())} w`, `${JOINS[s.lineJoin] ?? 0} j`] : [];
    out.push("q", gs(s.alpha * a), space, `${tint} ${set}`, ...line, ...segments, op, "Q");
  };

  const textPath = (text: string, x: number, y: number) => {
    const spacing = Number.parseFloat(s.letterSpacing) || 0;
    const shape = outline(text, s.font, spacing);
    if (shape === null) {
      fail(`text in ${s.font} without outlines`);
      return [];
    }
    const saved = { path, current, start };
    path = [];
    current = start = null;
    for (const cmd of shape.commands) {
      if (cmd.c === "Z") path.push("h");
      else if (cmd.c === "C")
        curveTo(x + cmd.x1, y + cmd.y1, x + cmd.x2, y + cmd.y2, x + cmd.x, y + cmd.y);
      else if (cmd.c === "M") moveTo(x + cmd.x, y + cmd.y);
      else lineTo(x + cmd.x, y + cmd.y);
    }
    const glyphs = path;
    ({ path, current, start } = saved);
    return glyphs;
  };

  const ctx = {
    get fillStyle() {
      return s.fill;
    },
    set fillStyle(v: unknown) {
      s.fill = v;
    },
    get strokeStyle() {
      return s.stroke;
    },
    set strokeStyle(v: unknown) {
      s.stroke = v;
    },
    get lineWidth() {
      return s.lineWidth;
    },
    set lineWidth(v: number) {
      s.lineWidth = v;
    },
    get lineJoin() {
      return s.lineJoin;
    },
    set lineJoin(v: CanvasLineJoin) {
      s.lineJoin = v;
    },
    get globalAlpha() {
      return s.alpha;
    },
    set globalAlpha(v: number) {
      s.alpha = v;
    },
    get globalCompositeOperation() {
      return s.composite;
    },
    set globalCompositeOperation(v: GlobalCompositeOperation) {
      s.composite = v;
    },
    get font() {
      return s.font;
    },
    set font(v: string) {
      s.font = v;
    },
    get letterSpacing() {
      return s.letterSpacing;
    },
    set letterSpacing(v: string) {
      s.letterSpacing = v;
    },
    textBaseline: "alphabetic" as CanvasTextBaseline,

    save() {
      stack.push({ ...s });
      out.push("q");
    },
    restore() {
      const prev = stack.pop();
      if (prev) {
        s = prev;
        out.push("Q");
      }
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      s.m = multiply(base, [a, b, c, d, e, f]);
    },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) {
      s.m = multiply(s.m, [a, b, c, d, e, f]);
    },
    translate(x: number, y: number) {
      s.m = multiply(s.m, [1, 0, 0, 1, x, y]);
    },
    scale(x: number, y: number) {
      s.m = multiply(s.m, [x, 0, 0, y, 0, 0]);
    },
    rotate(rad: number) {
      const [cos, sin] = [Math.cos(rad), Math.sin(rad)];
      s.m = multiply(s.m, [cos, sin, -sin, cos, 0, 0]);
    },

    beginPath() {
      path = [];
      current = start = null;
    },
    moveTo,
    lineTo,
    closePath() {
      if (current === null) return;
      path.push("h");
      current = start;
    },
    arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
      const delta = a1 - a0;
      const sweep = ccw
        ? -delta >= TAU
          ? -TAU
          : -(((-delta % TAU) + TAU) % TAU)
        : delta >= TAU
          ? TAU
          : ((delta % TAU) + TAU) % TAU;
      const at = (t: number): [number, number] => [cx + r * Math.cos(t), cy + r * Math.sin(t)];
      const [x0, y0] = at(a0);
      // Like a canvas, an arc is joined to the current point by a line, unless it starts there.
      const [px, py] = pt(x0, y0);
      if (current === null) moveTo(x0, y0);
      else if (Math.hypot(px - current[0], py - current[1]) > 1e-6) lineTo(x0, y0);
      const parts = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
      const step = sweep / parts;
      const k = (4 / 3) * Math.tan(step / 4);
      for (let i = 0; i < parts; i++) {
        const [a, b] = [a0 + i * step, a0 + (i + 1) * step];
        const [p0, p3] = [at(a), at(b)];
        curveTo(
          p0[0] - k * r * Math.sin(a),
          p0[1] + k * r * Math.cos(a),
          p3[0] + k * r * Math.sin(b),
          p3[1] - k * r * Math.cos(b),
          p3[0],
          p3[1],
        );
      }
    },
    fill(rule?: unknown) {
      if (typeof rule === "object" && rule !== null) fail("a Path2D fill");
      paint([...path], s.fill, rule === "evenodd" ? "f*" : "f");
    },
    stroke() {
      paint([...path], s.stroke, "S");
    },
    clip(rule?: unknown) {
      if (typeof rule === "object" && rule !== null) fail("a Path2D clip");
      if (path.length > 0) out.push(...path, rule === "evenodd" ? "W*" : "W", "n");
    },
    fillRect(x: number, y: number, w: number, h: number) {
      const saved = { path, current, start };
      path = [];
      moveTo(x, y);
      lineTo(x + w, y);
      lineTo(x + w, y + h);
      lineTo(x, y + h);
      path.push("h");
      paint(path, s.fill, "f");
      ({ path, current, start } = saved);
    },

    drawImage(source: CanvasImageSource, ...args: number[]) {
      if (!paintable()) return;
      const [iw, ih] = sizeOf(source);
      if (!(iw > 0 && ih > 0)) return;
      // drawImage(img, dx, dy), (img, dx, dy, dw, dh) or (img, sx, sy, sw, sh, dx, dy, dw, dh).
      const crop = args.length === 8;
      const [sx, sy, sw, sh] = crop ? args.slice(0, 4) : [0, 0, iw, ih];
      const [dx = 0, dy = 0, dw = iw, dh = ih] = crop ? args.slice(4) : args;
      if (sx === undefined || sy === undefined || sw === undefined || sh === undefined) return;
      if (!(sw > 0 && sh > 0 && dw !== 0 && dh !== 0)) return;
      const [kx, ky] = [dw / sw, dh / sh];
      // The whole image through the unit square (PDF images are drawn y up), cropped to `d`.
      const full = multiply(s.m, [iw * kx, 0, 0, -ih * ky, dx - sx * kx, dy - sy * ky + ih * ky]);
      let i = images.indexOf(source);
      if (i < 0) i = images.push(source) - 1;
      const cropped = sx !== 0 || sy !== 0 || sw !== iw || sh !== ih;
      const corners = [pt(dx, dy), pt(dx + dw, dy), pt(dx + dw, dy + dh), pt(dx, dy + dh)];
      const clip = cropped
        ? [...corners.map(([x, y], k) => `${n(x)} ${n(y)} ${k === 0 ? "m" : "l"}`), "h W n"]
        : [];
      out.push(
        "q",
        gs(s.alpha),
        ...clip,
        `${full.map(n).join(" ")} cm`,
        `/${names.image}${i} Do`,
        "Q",
      );
    },
    fillText(text: string, x: number, y: number) {
      paint(textPath(text, x, y), s.fill, "f");
    },
    strokeText(text: string, x: number, y: number) {
      paint(textPath(text, x, y), s.stroke, "S");
    },
    measureText(text: string) {
      const spacing = Number.parseFloat(s.letterSpacing) || 0;
      return { width: outline(text, s.font, spacing)?.advance ?? 0 } as TextMetrics;
    },
  };

  return {
    // The overloads of the DOM's 2D context cannot be spelled out member by member; the recorder
    // implements the forms the executor calls (see `Ctx2D`).
    ctx: ctx as unknown as Ctx2D,
    /** Starts the optional-content layer `name` (on by default): everything until `endLayer`. */
    beginLayer(name: string) {
      const i = layers.push(name) - 1;
      out.push(`/OC /VL${i} BDC`);
    },
    endLayer() {
      out.push("EMC");
    },
    finish(): VectorArt {
      return {
        content: out.join("\n"),
        images,
        alphas,
        layers,
        ...(unsupported ? { unsupported } : {}),
      };
    },
  };
}
