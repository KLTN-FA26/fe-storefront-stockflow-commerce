import type { PathCmd } from "../../geometry/types";
import type { Ctx2D } from "../../render/execute";
import { FALLBACK_FONT_FAMILY, fontCss } from "../../render/fonts";

/**
 * Colours of the brief as canvas colour strings. The engine owns no colour: the studio passes its
 * ink (the darkest text token) and the guide colours of its editor, and the brief is monochrome
 * around the customer's own colours.
 */
export type BriefStyle = {
  ink: string;
  family?: string;
  guides: { trim: string; safe: string; seam: string; crease: string };
};

/** A 2D context, with dashes where the context has them (a recording fake may not). */
export type BriefCtx = Ctx2D & { setLineDash?: (segments: number[]) => void };

const TAU = Math.PI * 2;
const mod = (angle: number) => ((angle % TAU) + TAU) % TAU;

type StrokeOptions = {
  color?: string;
  widthMm?: number;
  alpha?: number;
  dash?: number[];
  close?: boolean;
};

type TextOptions = {
  bold?: boolean;
  italic?: boolean;
  alpha?: number;
  align?: "left" | "right" | "center";
};

/** Drawing in mm on a page `pxPerMm` px per mm: text, wrapped paragraphs, lines and boxes. */
export function createPen(ctx: BriefCtx, pxPerMm: number, style: BriefStyle) {
  const px = (mm: number) => mm * pxPerMm;
  const family = style.family ?? FALLBACK_FONT_FAMILY;
  const font = (sizeMm: number, o: TextOptions = {}) =>
    fontCss({ family, bold: o.bold ?? false, italic: o.italic ?? false }, px(sizeMm));
  const width = (text: string, sizeMm: number, o: TextOptions = {}) => {
    ctx.font = font(sizeMm, o);
    return ctx.measureText(text).width / pxPerMm;
  };

  const pen = {
    px,
    /** One line at baseline `y`; returns its width in mm. */
    text(x: number, y: number, text: string, sizeMm: number, o: TextOptions = {}) {
      const w = width(text, sizeMm, o);
      const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
      ctx.save();
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.fillStyle = style.ink;
      ctx.textBaseline = "alphabetic";
      ctx.font = font(sizeMm, o);
      ctx.fillText(text, px(left), px(y));
      ctx.restore();
      return w;
    },
    /** `text` broken into lines no wider than `maxMm`, at most `maxLines` (the last cut with "…"). */
    lines(text: string, maxMm: number, sizeMm: number, o: TextOptions = {}, maxLines = Infinity) {
      const out: string[] = [];
      let line = "";
      for (const word of text.split(" ")) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (line !== "" && width(candidate, sizeMm, o) > maxMm) {
          out.push(line);
          line = word;
        } else line = candidate;
      }
      if (line !== "") out.push(line);
      if (out.length <= maxLines) return out;
      const kept = out.slice(0, maxLines);
      let last = `${kept[maxLines - 1] ?? ""}…`;
      while (last.length > 1 && width(last, sizeMm, o) > maxMm) last = `${last.slice(0, -2)}…`;
      kept[maxLines - 1] = last;
      return kept;
    },
    /** A wrapped paragraph from baseline `y`; returns the baseline after it. */
    para(
      x: number,
      y: number,
      maxMm: number,
      text: string,
      sizeMm: number,
      o: TextOptions = {},
      maxLines = Infinity,
    ) {
      let at = y;
      for (const line of pen.lines(text, maxMm, sizeMm, o, maxLines)) {
        pen.text(x, at, line, sizeMm, o);
        at += sizeMm * 1.4;
      }
      return at;
    },
    stroke(points: [number, number][], o: StrokeOptions = {}) {
      const [first, ...rest] = points;
      if (!first) return;
      ctx.save();
      ctx.globalAlpha = o.alpha ?? 1;
      ctx.strokeStyle = o.color ?? style.ink;
      ctx.lineWidth = px(o.widthMm ?? 0.25);
      ctx.setLineDash?.((o.dash ?? []).map(px));
      ctx.beginPath();
      ctx.moveTo(px(first[0]), px(first[1]));
      for (const [x, y] of rest) ctx.lineTo(px(x), px(y));
      if (o.close) ctx.closePath();
      ctx.stroke();
      ctx.restore();
    },
    box(x: number, y: number, w: number, h: number, o: { fill?: string; alpha?: number } = {}) {
      if (o.fill) {
        ctx.save();
        ctx.fillStyle = o.fill;
        ctx.fillRect(px(x), px(y), px(w), px(h));
        ctx.restore();
      }
      pen.stroke(
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
        ],
        { alpha: o.alpha ?? 0.35, close: true },
      );
    },
    /** A numbered ring: the element's number on the drawing and in its table row. */
    badge(x: number, y: number, n: number, r = 2.4) {
      ctx.save();
      ctx.strokeStyle = style.ink;
      ctx.lineWidth = px(0.35);
      ctx.beginPath();
      ctx.arc(px(x), px(y), px(r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      pen.text(x, y + r * 0.42, String(n), r * 1.15, { bold: true, align: "center" });
    },
    /** A dieline path drawn at `scale` from `origin`, in mm. */
    path(path: PathCmd[], origin: [number, number], scale: number, o: StrokeOptions = {}) {
      const points: [number, number][] = [];
      const at = (x: number, y: number): [number, number] => [
        origin[0] + x * scale,
        origin[1] + y * scale,
      ];
      for (const cmd of path) {
        if (cmd.c === "M" || cmd.c === "L") points.push(at(cmd.x, cmd.y));
        else if (cmd.c === "A") {
          const sweep = cmd.ccw ? -mod(cmd.start - cmd.end) : mod(cmd.end - cmd.start);
          for (let i = 0; i <= 48; i++) {
            const t = cmd.start + (sweep * i) / 48;
            points.push(at(cmd.cx + cmd.r * Math.cos(t), cmd.cy + cmd.r * Math.sin(t)));
          }
        } else if (points[0]) points.push(points[0]);
      }
      pen.stroke(points, o);
    },
  };
  return pen;
}

export type Pen = ReturnType<typeof createPen>;
