import type { SurfaceChangeCause } from "./studio-context";

/** How long the design must be still (no edit) before what was painted coarse is painted sharp. */
export const IDLE_MS = 150;

/**
 * Most pixels of one wrapped image's remap while the customer drags, scales or draws
 * (`RenderEnv.warpBudgetPx`). The stage and the 3D texture both remap it every frame; measured for a
 * full-height cup picture (stage 6 px/mm, texture 1024 px): 0.25 MP costs about 68 ms a frame,
 * 0.15 MP about 41 ms, none about 182 ms. 0.15 MP keeps a drag near 25 frames a second with the 3D
 * view open; the picture is about 2.3 px/mm meanwhile, and sharp again `IDLE_MS` after the gesture.
 */
export const INTERACTIVE_WARP_BUDGET_PX = 150_000;

/** Why a paint is asked for: a surface change, or the canvas's own resolution changing. */
export type PaintCause = SurfaceChangeCause | "zoom";

/**
 * How to paint: `sharp` at rest; `gesture` mid-drag (wrapped images within the remap budget);
 * `zoom` while the resolution keeps changing (the budget too, and no layer kept at a resolution the
 * next frame will not use).
 */
export type PaintMode = "sharp" | "gesture" | "zoom";

export type PaintSchedule<K> = {
  /**
   * Paints `keys` on the next animation frame (with whatever else was asked since). An `edit` (a
   * drag is one per frame) or a `zoom` makes paints coarse until `IDLE_MS` pass without either;
   * then what was painted coarse is painted once more, sharp. An edit mid-zoom stays a zoom.
   */
  request(keys: Iterable<K>, cause?: PaintCause): void;
  dispose(): void;
};

/** At most one `paint` per animation frame, told how sharp to paint it. */
export function schedulePaints<K>(paint: (keys: K[], mode: PaintMode) => void): PaintSchedule<K> {
  const dirty = new Set<K>();
  /** Painted coarse, owed a sharp paint once editing pauses. */
  const coarse = new Set<K>();
  let frame: number | null = null;
  let mode: PaintMode = "sharp";
  let idle: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    frame = null;
    const keys = [...dirty];
    dirty.clear();
    for (const key of keys) {
      if (mode === "sharp") coarse.delete(key);
      else coarse.add(key);
    }
    paint(keys, mode);
  };

  const request = (keys: Iterable<K>, cause?: PaintCause) => {
    if (cause === "edit" || cause === "zoom") {
      mode = cause === "zoom" || mode === "zoom" ? "zoom" : "gesture";
      if (idle !== null) clearTimeout(idle);
      idle = setTimeout(() => {
        idle = null;
        mode = "sharp";
        request(coarse);
      }, IDLE_MS);
    }
    for (const key of keys) dirty.add(key);
    if (dirty.size > 0) frame ??= requestAnimationFrame(flush);
  };

  return {
    request,
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      if (idle !== null) clearTimeout(idle);
      frame = null;
      idle = null;
    },
  };
}
