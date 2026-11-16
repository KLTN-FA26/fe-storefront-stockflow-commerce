import type { PathCmd } from "../geometry/types";
import type { Guide } from "../surfaces/types";
import type { ChromeColors, Ctx2D, RenderEnv } from "./execute";
import type { DrawOp } from "./ops";
import { tracePath } from "./paint";

/** Reach of the outside-the-trim shade: far beyond any surface, the canvas clips the rest. */
const SHADE_EXTENT_MM = 10_000;

function guideColor(chrome: ChromeColors, kind: Guide["kind"]): string {
  return kind === "trim" ? chrome.guide : chrome[kind];
}

/** The editor's overlay: the veil outside the trim, then each guide line one output px wide. */
export function drawGuides(
  ctx: Ctx2D,
  op: Extract<DrawOp, { op: "guides" }>,
  env: RenderEnv,
): void {
  ctx.save();
  if (op.shadeOutside.length > 0) {
    const e = SHADE_EXTENT_MM;
    const everything: PathCmd[] = [
      { c: "M", x: -e, y: -e },
      { c: "L", x: e, y: -e },
      { c: "L", x: e, y: e },
      { c: "L", x: -e, y: e },
      { c: "Z" },
    ];
    ctx.fillStyle = env.chrome.shade;
    tracePath(ctx, [...everything, ...op.shadeOutside]);
    ctx.fill("evenodd");
  }
  ctx.lineWidth = 1 / env.pxPerMm;
  for (const guide of op.guides) {
    ctx.strokeStyle = guideColor(env.chrome, guide.kind);
    tracePath(ctx, guide.path);
    ctx.stroke();
  }
  ctx.restore();
}
