/** A colour as red, green, blue and alpha, each 0–1. */
export type Rgba = [r: number, g: number, b: number, a: number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i;

/**
 * The canvas colour strings the executor sets (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` and
 * `rgba()`), or `null` for anything else (a named colour, `hsl()`): the caller then does not guess.
 */
export function parseCssColor(value: string): Rgba | null {
  const text = value.trim();
  const hex = HEX.exec(text)?.[1];
  if (hex !== undefined) {
    const digits = hex.length <= 4 ? [...hex].map((d) => d + d) : (hex.match(/../g) ?? []);
    const [r = 0, g = 0, b = 0, a = 255] = digits.map((d) => Number.parseInt(d, 16));
    return [r / 255, g / 255, b / 255, a / 255];
  }
  const rgb = RGB.exec(text);
  if (rgb === null) return null;
  const [, r = "0", g = "0", b = "0", a] = rgb;
  const alpha = a === undefined ? 1 : a.endsWith("%") ? Number.parseFloat(a) / 100 : Number(a);
  const channels = [r, g, b].map((c) => Math.min(1, Number(c) / 255));
  return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, Math.min(1, Math.max(0, alpha))];
}
