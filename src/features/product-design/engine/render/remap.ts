import type { PointMm } from "../geometry/types";

/** RGBA pixels, row by row, not premultiplied (like `ImageData`). */
export type Raster = { data: Uint8ClampedArray; width: number; height: number };

/**
 * Resamples `src` onto a new `dst`-sized raster (spec §5.1). For each destination pixel centre
 * `(px + 0.5, py + 0.5)`, `toLocal` gives the local mm it shows; `src` covers local mm from
 * `(srcFrame.x, srcFrame.y)` at `k = srcFrame.pxPerMm`, so it is sampled at
 * `((x − srcFrame.x) · k − 0.5, (y − srcFrame.y) · k − 0.5)` (source pixel centres sit on whole
 * numbers). Sampling is bilinear on premultiplied colour, so a transparent neighbour lowers the
 * alpha without darkening the colour; neighbours outside `src` count as transparent, so the
 * edges come out anti-aliased, never stretched. Pure: no canvas, no DOM.
 */
export function remapRaster(
  src: Raster,
  srcFrame: { x: number; y: number; pxPerMm: number },
  dst: { width: number; height: number },
  toLocal: (px: number, py: number) => PointMm,
): Raster {
  const { data: s, width: sw, height: sh } = src;
  const { x: originX, y: originY, pxPerMm: k } = srcFrame;
  const data = new Uint8ClampedArray(dst.width * dst.height * 4);
  let o = 0;
  for (let py = 0; py < dst.height; py++) {
    for (let px = 0; px < dst.width; px++, o += 4) {
      const local = toLocal(px + 0.5, py + 0.5);
      const sx = (local.x - originX) * k - 0.5;
      const sy = (local.y - originY) * k - 0.5;
      // All four neighbours outside the source (or no point at all): stays transparent black.
      if (!(sx > -1 && sy > -1 && sx < sw && sy < sh)) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let corner = 0; corner < 4; corner++) {
        const x = x0 + (corner & 1);
        const y = y0 + (corner >> 1);
        if (x < 0 || y < 0 || x >= sw || y >= sh) continue;
        const i = (y * sw + x) * 4;
        const weight = (corner & 1 ? fx : 1 - fx) * (corner >> 1 ? fy : 1 - fy);
        const alpha = (s[i + 3] ?? 0) * weight;
        r += (s[i] ?? 0) * alpha;
        g += (s[i + 1] ?? 0) * alpha;
        b += (s[i + 2] ?? 0) * alpha;
        a += alpha;
      }
      // An alpha that rounds to 0 is left transparent black, whatever colour it carried.
      if (!(a > 0.5)) continue;
      data[o] = r / a;
      data[o + 1] = g / a;
      data[o + 2] = b / a;
      data[o + 3] = a;
    }
  }
  return { data, width: dst.width, height: dst.height };
}
