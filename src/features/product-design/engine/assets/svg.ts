/** Size SVG reports when it says none: a square the print pipeline rasterises generously. */
const DEFAULT_SIZE_PX = 2000;
/** The longest edge a rasterised SVG may have; browsers refuse canvases far past this. */
const MAX_RASTER_EDGE_PX = 8192;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** CSS px per unit of an SVG length, as `[px, per]` so `value * px / per` stays exact (72 pt = 96 px). */
const PX_PER_UNIT: Record<string, readonly [number, number]> = {
  "": [1, 1],
  px: [1, 1],
  in: [96, 1],
  cm: [96, 2.54],
  mm: [96, 25.4],
  pt: [96, 72],
  pc: [16, 1],
};

export type SvgSize = { width: number; height: number };

/** Comments, processing instructions, CDATA and the doctype, blanked out so indices stay valid. */
function maskProlog(text: string): string {
  const blank = (match: string) => " ".repeat(match.length);
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<\?[\s\S]*?\?>/g, blank)
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, blank)
    .replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>/gi, blank);
}

type RootTag = { start: number; end: number; attrs: string; selfClosing: boolean };

/** The root `<svg …>` start tag: where it sits in `text` and its attribute text. */
function findRoot(text: string): RootTag | null {
  const match = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(maskProlog(text));
  if (!match) return null;
  const selfClosing = match[1]?.endsWith("/") ?? false;
  const attrs = (match[1] ?? "").replace(/\/$/, "");
  return { start: match.index, end: match.index + match[0].length, attrs, selfClosing };
}

/** The value of attribute `name` in an attribute list; `-width` does not count as `width`. */
function attribute(attrs: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs);
  return match?.[1] ?? match?.[2];
}

/** An SVG length in CSS px; `undefined` for a percentage, `em`, a negative or an unreadable one. */
function parseLength(value: string | undefined): number | undefined {
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value ?? "");
  const unit = PX_PER_UNIT[(match?.[2] ?? "").toLowerCase()];
  if (!match || !unit) return undefined;
  const px = (Number(match[1]) * unit[0]) / unit[1];
  return Number.isFinite(px) && px > 0 ? px : undefined;
}

function parseViewBox(value: string | undefined): SvgSize | undefined {
  const parts = (value ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [width, height] = [parts[2], parts[3]];
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return undefined;
  return width !== undefined && height !== undefined && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

/**
 * The size an SVG draws at, in CSS px (96 per inch): its `width`/`height` attributes (px, mm, cm,
 * in, pt, pc or unitless), a missing one completed from the `viewBox` ratio; with neither, the
 * viewBox itself; with nothing usable, 2000 × 2000.
 */
export function svgIntrinsicSize(svgText: string): SvgSize {
  const attrs = findRoot(svgText)?.attrs ?? "";
  const width = parseLength(attribute(attrs, "width"));
  const height = parseLength(attribute(attrs, "height"));
  const box = parseViewBox(attribute(attrs, "viewBox"));

  if (width !== undefined && height !== undefined) return { width, height };
  if (width !== undefined) {
    return { width, height: box ? (width * box.height) / box.width : width };
  }
  if (height !== undefined) {
    return { width: box ? (height * box.width) / box.height : height, height };
  }
  return box ?? { width: DEFAULT_SIZE_PX, height: DEFAULT_SIZE_PX };
}

const round3 = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The SVG made safe to draw from an `<img>`: the root gets an explicit px `width`/`height` (a
 * percentage or a missing size leaves the image without a size of its own), a `viewBox` when it had
 * none (so the content scales with the size) and the SVG namespace (an image without it is not an
 * image). The content is untouched. Also returns the size it reports.
 */
export function prepareSvg(svgText: string): SvgSize & { svg: string } {
  const size = svgIntrinsicSize(svgText);
  const root = findRoot(svgText);
  if (!root) return { ...size, svg: svgText };

  const [w, h] = [round3(size.width), round3(size.height)];
  let attrs = root.attrs
    .replace(/(?:^|\s)(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/g, "")
    .replace(/\s+$/, "");
  if (!parseViewBox(attribute(attrs, "viewBox"))) {
    attrs = attrs.replace(/(?:^|\s)viewBox\s*=\s*(?:"[^"]*"|'[^']*')/, "");
    attrs += ` viewBox="0 0 ${w} ${h}"`;
  }
  if (attribute(attrs, "xmlns") === undefined) attrs += ` xmlns="${SVG_NAMESPACE}"`;
  attrs += ` width="${w}" height="${h}"`;

  const tag = `<svg${attrs}${root.selfClosing ? "/>" : ">"}`;
  return { ...size, svg: svgText.slice(0, root.start) + tag + svgText.slice(root.end) };
}

/** The pixel size to draw an SVG of `size` at: `targetWidthPx` wide, its longest edge capped. */
export function svgRasterSize(size: SvgSize, targetWidthPx: number): SvgSize {
  const width = Math.max(1, Math.round(targetWidthPx));
  const height = Math.max(1, Math.round((width * size.height) / size.width));
  const shrink = Math.min(1, MAX_RASTER_EDGE_PX / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * shrink)),
    height: Math.max(1, Math.round(height * shrink)),
  };
}

/**
 * Draws an SVG to a transparent PNG `targetWidthPx` wide (browser only): the SVG goes through an
 * `<img>` from a `blob:` URL, where scripts and outside resources never run, onto a canvas. An
 * extreme ratio is shrunk to `MAX_RASTER_EDGE_PX` on its longest edge. Rejects when the browser
 * cannot draw the SVG.
 */
export async function rasterizeSvg(svgText: string, targetWidthPx: number): Promise<Blob> {
  const { svg, ...size } = prepareSvg(svgText);
  const { width, height } = svgRasterSize(size, targetWidthPx);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The SVG could not be drawn"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D canvas to draw the SVG on");
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error("The PNG could not be encoded"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
