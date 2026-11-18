import type { Font } from "fontkit";

import type { GlyphCmd, GlyphOutliner } from "../../engine";

/** A text style the print draws: the registry's family list, and the weight and slant it asks for. */
export type GlyphStyle = { family: string; bold: boolean; italic: boolean };

/** One `@font-face` of the page: a face of a family, the code points it holds and where it is. */
export type FontFace = {
  family: string;
  italic: boolean;
  /** Weights it covers: `[400, 400]` for a static face, `[100, 900]` for a variable one. */
  weights: [number, number];
  /** `unicode-range`, or `null` for every code point. */
  ranges: [number, number][] | null;
  url: string;
};

const unquote = (value: string) => value.trim().replace(/^["']|["']$/g, "");
/** The first family of a CSS family list: the self-hosted one (the rest are fallbacks). */
export const firstFamily = (list: string) => unquote(list.split(",")[0] ?? "");

/** `unicode-range` (`U+0000-00FF, U+0131, U+1EA0-1EF9`) as inclusive code point ranges. */
export function parseUnicodeRange(value: string): [number, number][] | null {
  const ranges = value
    .split(",")
    .map((part) => /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim()))
    .filter((match) => match !== null)
    .map(([, from = "0", to]): [number, number] => {
      if (from.includes("?")) {
        return [
          Number.parseInt(from.replace(/\?/g, "0"), 16),
          Number.parseInt(from.replace(/\?/g, "f"), 16),
        ];
      }
      const start = Number.parseInt(from, 16);
      return [start, to === undefined ? start : Number.parseInt(to, 16)];
    });
  return ranges.length > 0 ? ranges : null;
}

function parseWeights(value: string): [number, number] {
  const named: Record<string, number> = { normal: 400, bold: 700 };
  const [lo, hi] = value
    .trim()
    .split(/\s+/)
    .map((w) => named[w] ?? Number(w));
  const low = Number.isFinite(lo) ? (lo as number) : 400;
  return [low, Number.isFinite(hi) ? (hi as number) : low];
}

/** The page's `@font-face` rules (next/font self-hosts the studio's fonts as such rules). */
export function pageFontFaces(): FontFace[] {
  const faces: FontFace[] = [];
  const walk = (rules: CSSRuleList, base: string) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule) {
        const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(
          rule.style.getPropertyValue("src"),
        )?.[1];
        if (src === undefined) continue;
        faces.push({
          family: unquote(rule.style.getPropertyValue("font-family")),
          italic: rule.style.getPropertyValue("font-style").trim() === "italic",
          weights: parseWeights(rule.style.getPropertyValue("font-weight") || "400"),
          ranges: parseUnicodeRange(rule.style.getPropertyValue("unicode-range")),
          url: new URL(src, base).href,
        });
      } else if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList) {
        walk(rule.cssRules, base);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules, sheet.href ?? document.baseURI);
    } catch {
      // A cross-origin sheet cannot be read; the studio's own fonts are same-origin.
    }
  }
  return faces;
}

type Loaded = { ranges: [number, number][] | null; font: Font };

const covers = (ranges: Loaded["ranges"], cp: number) =>
  ranges === null || ranges.some(([lo, hi]) => cp >= lo && cp <= hi);

const FONT_CSS = /^(italic )?(\d+) ([\d.]+)px (.+)$/;

/** Glyph outlines of `font` at `size` px from `x0`, y down, as `GlyphCmd`s; returns the advance. */
function outlineRun(
  font: Font,
  text: string,
  size: number,
  x0: number,
  spacing: number,
  out: GlyphCmd[],
) {
  const k = size / font.unitsPerEm;
  const run = font.layout(text);
  let pen = x0;
  run.glyphs.forEach((glyph, i) => {
    const pos = run.positions[i];
    const ox = pen + (pos?.xOffset ?? 0) * k;
    const oy = -(pos?.yOffset ?? 0) * k;
    let [cx, cy] = [0, 0];
    const at = (x: number, y: number): [number, number] => [ox + x * k, oy - y * k];
    for (const { command, args } of glyph.path.commands) {
      if (command === "moveTo" || command === "lineTo") {
        const [x, y] = at(args[0] ?? 0, args[1] ?? 0);
        out.push({ c: command === "moveTo" ? "M" : "L", x, y });
        [cx, cy] = [x, y];
      } else if (command === "quadraticCurveTo") {
        const [qx, qy] = at(args[0] ?? 0, args[1] ?? 0);
        const [x, y] = at(args[2] ?? 0, args[3] ?? 0);
        out.push({
          c: "C",
          x1: cx + (2 / 3) * (qx - cx),
          y1: cy + (2 / 3) * (qy - cy),
          x2: x + (2 / 3) * (qx - x),
          y2: y + (2 / 3) * (qy - y),
          x,
          y,
        });
        [cx, cy] = [x, y];
      } else if (command === "bezierCurveTo") {
        const [x1, y1] = at(args[0] ?? 0, args[1] ?? 0);
        const [x2, y2] = at(args[2] ?? 0, args[3] ?? 0);
        const [x, y] = at(args[4] ?? 0, args[5] ?? 0);
        out.push({ c: "C", x1, y1, x2, y2, x, y });
        [cx, cy] = [x, y];
      } else {
        out.push({ c: "Z" });
      }
    }
    pen += (pos?.xAdvance ?? 0) * k + spacing;
  });
  return pen;
}

/**
 * Loads the faces the print's text uses (the page's own `@font-face` files, the ones the canvas
 * draws with) and returns an outliner for them. A code point no loaded face holds, or a weight the
 * family has no face for (the browser would synthesise it), gives `null`: that page is rasterised.
 */
export async function createGlyphOutliner(styles: GlyphStyle[]): Promise<GlyphOutliner> {
  const fontkit = await import("fontkit");
  const faces = pageFontFaces();
  const files = new Map<string, Promise<Font | null>>();
  const fetchFont = (url: string) => {
    let pending = files.get(url);
    if (pending === undefined) {
      pending = fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
        // fontkit's browser build reads any byte array; its types name node's Buffer.
        .then((bytes) => fontkit.create(new Uint8Array(bytes) as unknown as Buffer))
        .then((font) => ("unitsPerEm" in font ? font : null));
      files.set(url, pending);
    }
    return pending;
  };

  const sets = new Map<string, Loaded[]>();
  const keyOf = (family: string, italic: boolean, weight: number) =>
    `${family}|${italic}|${weight}`;
  for (const style of styles) {
    const family = firstFamily(style.family);
    const weight = style.bold ? 700 : 400;
    const key = keyOf(family, style.italic, weight);
    if (sets.has(key)) continue;
    const matching = faces.filter(
      (f) =>
        f.family === family &&
        f.italic === style.italic &&
        weight >= f.weights[0] &&
        weight <= f.weights[1],
    );
    const loaded = await Promise.all(
      matching.map(async (face): Promise<Loaded | null> => {
        const font = await fetchFont(face.url);
        if (font === null) return null;
        const variable = font.variationAxes.wght !== undefined;
        return { ranges: face.ranges, font: variable ? font.getVariation({ wght: weight }) : font };
      }),
    );
    sets.set(
      key,
      loaded.filter((face) => face !== null),
    );
  }

  return (text, css, spacing) => {
    const match = FONT_CSS.exec(css);
    if (match === null) return null;
    const [, italic, weight = "400", size = "0", list = ""] = match;
    const set = sets.get(keyOf(firstFamily(list), italic !== undefined, Number(weight)));
    if (set === undefined || set.length === 0) return null;
    // Runs of code points by the face that holds them, as the browser falls back face by face.
    const runs: { face: Loaded; text: string }[] = [];
    for (const char of text) {
      const cp = char.codePointAt(0) ?? 0;
      const face = set.find((f) => covers(f.ranges, cp) && f.font.hasGlyphForCodePoint(cp));
      const previous = runs.at(-1);
      if (face === undefined) {
        // A space no face of the set lists still advances: it rides with the run before it.
        if (/\s/.test(char) && previous !== undefined) {
          previous.text += char;
          continue;
        }
        return null;
      }
      if (previous?.face === face) previous.text += char;
      else runs.push({ face, text: char });
    }
    const commands: GlyphCmd[] = [];
    let pen = 0;
    for (const run of runs)
      pen = outlineRun(run.face.font, run.text, Number(size), pen, spacing, commands);
    return { commands, advance: pen };
  };
}
