"use client";

import { useEffect, useEffectEvent, useState } from "react";

import {
  printUnderlay,
  type EditorController,
  type PrintAreaCode,
  type SurfaceSet,
} from "../../engine";
import { INTERACTIVE_WARP_BUDGET_PX, schedulePaints, type PaintMode } from "./paint-schedule";
import { subscribeSurfaceChanges, useStudio } from "./studio-context";
import { materialOf, paintSurface } from "./studio-paint";

/** Longest texture edge while the customer drags or draws (cheap to re-upload every frame). */
export const INTERACTIVE_TEXTURE_PX = 1024;
/** Longest texture edge once the design has been still for `IDLE_MS`. */
export const IDLE_TEXTURE_PX = 2048;

type Options = {
  surfaces: SurfaceSet;
  editor: EditorController;
  /** A surface's texture canvas was repainted (same canvas each time, possibly resized). */
  onTexture: (code: PrintAreaCode, canvas: HTMLCanvasElement) => void;
};

/**
 * The 3D model's textures: one offscreen canvas per print area, composed for `texture`. Only the
 * surfaces a change touched are repainted: at 1024 px, wrapped images within a small remap budget,
 * while edits keep coming (a drag is one edit per frame), then at 2048 px once none came for 150 ms.
 * Images and fonts arriving repaint at 2048 px. Returns the canvases, so a viewer created later can
 * take the ones already painted.
 */
export function useSurfaceRenderer({ surfaces, editor, onTexture }: Options) {
  const services = useStudio();
  const { repaint } = services;
  const [canvases] = useState(() => new Map<PrintAreaCode, HTMLCanvasElement>());
  // An empty part of the texture must read as the stock, not as black.
  const underlay = printUnderlay(materialOf(services.template));

  const paint = useEffectEvent((codes: Iterable<PrintAreaCode>, mode: PaintMode) => {
    const interacting = mode !== "sharp";
    const longEdgePx = interacting ? INTERACTIVE_TEXTURE_PX : IDLE_TEXTURE_PX;
    const warpBudgetPx = interacting ? INTERACTIVE_WARP_BUDGET_PX : undefined;
    for (const code of codes) {
      const surface = surfaces.byCode[code];
      if (surface === undefined) continue;
      let canvas = canvases.get(code);
      if (canvas === undefined) {
        canvas = document.createElement("canvas");
        canvases.set(code, canvas);
      }
      const { width, height } = surface.flatBounds;
      const pxPerMm = longEdgePx / Math.max(width, height);
      paintSurface(canvas, services, code, "texture", pxPerMm, { underlay, warpBudgetPx });
      onTexture(code, canvas);
    }
  });

  useEffect(() => {
    const schedule = schedulePaints<PrintAreaCode>((codes, mode) => paint(codes, mode));
    schedule.request(surfaces.order);
    const unsubscribe = subscribeSurfaceChanges({ editor, repaint }, (codes, cause) =>
      schedule.request(codes, cause),
    );
    return () => {
      unsubscribe();
      schedule.dispose();
    };
  }, [editor, repaint, surfaces]);

  return canvases;
}
