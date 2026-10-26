"use client";

import { useEffect, useEffectEvent, useState, type RefObject } from "react";

import type { ComposeTarget, PrintAreaCode } from "../../engine";
import { subscribeSurfaceChanges, useStudio } from "./studio-context";
import { paintSurface } from "./studio-paint";

/**
 * Keeps `canvasRef` painted with surface `code` for `target` at `pxPerMm`, at most once per
 * animation frame: after a change to that surface, an image or a font arriving, or new arguments.
 */
export function useSurfacePaint(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  code: PrintAreaCode,
  target: ComposeTarget,
  pxPerMm: number,
) {
  const services = useStudio();
  const { editor, repaint } = services;
  const paint = useEffectEvent(() => {
    const canvas = canvasRef.current;
    if (canvas) paintSurface(canvas, services, code, target, pxPerMm);
  });

  useEffect(() => {
    let frame: number | null = null;
    const request = () => {
      frame ??= requestAnimationFrame(() => {
        frame = null;
        paint();
      });
    };
    request();
    const unsubscribe = subscribeSurfaceChanges({ editor, repaint }, (codes) => {
      if (codes.includes(code)) request();
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [editor, repaint, code, target, pxPerMm]);
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
