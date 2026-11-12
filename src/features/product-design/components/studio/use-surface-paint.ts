"use client";

import { useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";

import type { ComposeTarget, PrintAreaCode } from "../../engine";
import {
  INTERACTIVE_WARP_BUDGET_PX,
  schedulePaints,
  type PaintMode,
  type PaintSchedule,
} from "./paint-schedule";
import { subscribeSurfaceChanges, useStudio } from "./studio-context";
import { paintSurface } from "./studio-paint";

/**
 * Keeps `canvasRef` painted with surface `code` for `target` at `pxPerMm`, at most once per
 * animation frame: after a change to that surface, an image or a font arriving, or new arguments.
 * While edits keep coming (a drag) or the resolution keeps changing (a zoom), wrapped images are
 * remapped within a small budget, and mid-zoom nothing made at the passing resolutions is kept (a
 * wrapped image's source is, until its size in px changes); once it all pauses the surface is
 * painted once more, sharp.
 */
export function useSurfacePaint(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  code: PrintAreaCode,
  target: ComposeTarget,
  pxPerMm: number,
) {
  const services = useStudio();
  const { editor, repaint } = services;
  const schedule = useRef<PaintSchedule<PrintAreaCode> | null>(null);
  /** The surface and resolution last asked for: a new resolution of the same surface is a zoom. */
  const shown = useRef({ code, pxPerMm });
  const paint = useEffectEvent((mode: PaintMode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintSurface(canvas, services, code, target, pxPerMm, {
      warpBudgetPx: mode === "sharp" ? undefined : INTERACTIVE_WARP_BUDGET_PX,
      keepLayers: mode !== "zoom",
    });
  });

  useEffect(() => {
    const paints = schedulePaints<PrintAreaCode>((_codes, mode) => paint(mode));
    schedule.current = paints;
    paints.request([code]);
    const unsubscribe = subscribeSurfaceChanges({ editor, repaint }, (codes, cause) => {
      if (codes.includes(code)) paints.request([code], cause);
    });
    return () => {
      unsubscribe();
      paints.dispose();
      schedule.current = null;
    };
  }, [editor, repaint, code, target]);

  useEffect(() => {
    const last = shown.current;
    if (last.code === code && last.pxPerMm === pxPerMm) return;
    shown.current = { code, pxPerMm };
    // The first resolution of a surface (the stage measured, another surface shown) is painted
    // sharp; a change from one painted resolution to another (a pinch, the zoom buttons, the stage
    // resized) is painted like a gesture.
    const zoomed = last.code === code && last.pxPerMm > 0;
    schedule.current?.request([code], zoomed ? "zoom" : undefined);
  }, [code, pxPerMm]);
}

/** The laid-out content size of an element, kept current by a `ResizeObserver` (0 × 0 before). */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // An observer reports the size it starts with, so no separate first measurement is needed.
    const observer = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = element;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
