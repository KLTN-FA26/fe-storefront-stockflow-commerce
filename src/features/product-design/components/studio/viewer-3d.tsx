"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import { hitTest, ProductViewer } from "../../engine";
import { useStudio } from "./studio-context";
import { useSurfaceRenderer } from "./use-surface-renderer";
import { ViewerTitle, ViewerToolbar } from "./viewer-toolbar";

/** A pointer that moved further than this between press and release was orbiting, not clicking. */
const CLICK_SLOP_PX = 5;

/**
 * Hosts the three.js `ProductViewer`: textures from `useSurfaceRenderer`, the camera turned to the
 * active surface, a click on the model selects the element under it, and the view toolbar.
 * `onUnavailable` hands over to the flat preview (the model cannot be built, the context is lost,
 * a render fails).
 * "Toàn màn hình" shows `fullscreenTarget`, the whole preview panel, so the colour disclaimer
 * (BR-07) stays on screen with the model.
 */
export function Viewer3D({
  onUnavailable,
  fullscreenTarget,
}: {
  onUnavailable: () => void;
  fullscreenTarget: RefObject<HTMLElement | null>;
}) {
  const { editor, surfaces, template, sizer, viewerRef: studioViewerRef } = useStudio();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ProductViewer | null>(null);
  const pressedAt = useRef<{ x: number; y: number } | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const giveUp = useEffectEvent(onUnavailable);

  const textures = useSurfaceRenderer({
    surfaces,
    editor,
    onTexture: (code, canvas) => viewerRef.current?.setSurfaceTexture(code, canvas),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewer: ProductViewer | undefined;
    try {
      viewer = new ProductViewer(canvas);
      viewer.setModel(template, surfaces);
    } catch {
      viewer?.dispose();
      giveUp();
      return;
    }
    const offLost = viewer.on("contextlost", () => giveUp());
    // A render that throws (out of GPU memory, a driver fault) would leave a blank model: give up too.
    const offError = viewer.on("error", () => giveUp());
    // Textures painted before this viewer existed (a remount) are handed over now.
    for (const [code, texture] of textures) viewer.setSurfaceTexture(code, texture);
    viewerRef.current = viewer;
    studioViewerRef.current = viewer; // the preview export screenshots it, the preflight panel turns it
    const offSurface = editor.store.subscribe((state, prev) => {
      if (state.activeSurface !== prev.activeSurface) viewer.focusSurface(state.activeSurface);
    });
    return () => {
      offSurface();
      offLost();
      offError();
      viewerRef.current = null;
      if (studioViewerRef.current === viewer) studioViewerRef.current = null;
      viewer.dispose();
    };
  }, [editor, template, surfaces, textures, studioViewerRef]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === fullscreenTarget.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fullscreenTarget]);

  const toggleFullscreen = () => {
    // A refused request (no permission, an iframe) leaves the view as it is: nothing to report.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void fullscreenTarget.current?.requestFullscreen().catch(() => undefined);
  };

  const onPointerDown = (event: PointerEvent) => {
    pressedAt.current = { x: event.clientX, y: event.clientY };
  };
  const onClick = (event: MouseEvent) => {
    const start = pressedAt.current;
    pressedAt.current = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP_PX) {
      return;
    }
    const hit = viewerRef.current?.pick(event.clientX, event.clientY);
    const surface = hit ? surfaces.byCode[hit.surfaceCode] : undefined;
    if (!hit || !surface) return;
    const content = editor.store.getState().document.surfaces[hit.surfaceCode];
    const point = surface.toFlat(hit.u, hit.v);
    editor.setActiveSurface(hit.surfaceCode);
    editor.select(content ? hitTest(content, surface, sizer, point) : null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewerTitle>
        <ViewerToolbar
          autoRotate={autoRotate}
          onAutoRotate={(on) => {
            setAutoRotate(on);
            viewerRef.current?.setAutoRotate(on);
          }}
          onResetView={() => viewerRef.current?.resetView()}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
        />
      </ViewerTitle>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Mô hình 3D của sản phẩm: kéo để xoay, bấm vào hình để chọn"
          className="absolute inset-0 block size-full touch-none"
          onPointerDown={onPointerDown}
          onClick={onClick}
        />
      </div>
    </div>
  );
}
