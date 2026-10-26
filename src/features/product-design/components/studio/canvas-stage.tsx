"use client";

import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useId, useRef } from "react";

import { Button } from "@/components/ui/button";

import { MAX_ZOOM, MIN_ZOOM, type RectMm } from "../../engine";
import { InteractionOverlay, type OverlayHandle } from "./interaction-overlay";
import { hasCoarsePointer, stagePxPerMm } from "./stage-resolution";
import { StudioIconButton } from "./studio-icon-button";
import { useEditorState, useStudio } from "./studio-context";
import { TextEditOverlay } from "./text-edit-overlay";
import { useStagePinch } from "./use-stage-pinch";
import { useStudioShortcuts } from "./use-studio-shortcuts";
import { useElementSize, useSurfacePaint } from "./use-surface-paint";

/** Room left around the dieline at "Vừa khung", in CSS px (the stage's `p-6`). */
const STAGE_GUTTER_PX = 24;
const ZOOM_STEP = 1.25;

/** CSS px per mm that fits the whole bleed box in `box` with the gutter around it. */
function fitScale(box: { width: number; height: number }, bounds: RectMm) {
  const room = (length: number) => Math.max(length - 2 * STAGE_GUTTER_PX, 0);
  return Math.min(room(box.width) / bounds.width, room(box.height) / bounds.height);
}

/**
 * The 2D editor view of the active print area: its dieline at `fitScale × zoom` (the canvas bitmap
 * at device resolution, within the edge and area caps of `stagePxPerMm`), with the bleed, trim,
 * safe, seam and crease guides, the selection overlay and the zoom controls. The stage takes the
 * studio's keyboard shortcuts while focus is inside it; its view is focusable for that. On a touch
 * screen one finger is the tool's and two fingers pinch to zoom and pan (`useStagePinch`), so the
 * view takes no touch scrolling of its own.
 */
export function CanvasStage() {
  const { editor, surfaces, template, stageRef } = useStudio();
  const active = useEditorState((s) => s.activeSurface);
  const zoom = useEditorState((s) => s.zoom);
  const count = useEditorState((s) => s.document.surfaces[s.activeSurface]?.elements.length ?? 0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<OverlayHandle>(null);
  const viewport = useElementSize(viewportRef);
  const hintId = useId();
  useStudioShortcuts(stageRef);
  const pinch = useStagePinch({
    viewportRef,
    canvasRef,
    zoom,
    onStart: () => overlayRef.current?.cancelGesture(),
  });
  const focusStage = useCallback(() => viewportRef.current?.focus({ preventScroll: true }), []);

  const bounds = surfaces.byCode[active]?.flatBounds;
  const cssPxPerMm = bounds ? fitScale(viewport, bounds) * zoom : 0;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pxPerMm = bounds
    ? stagePxPerMm({ cssPxPerMm, dpr, bounds, coarsePointer: hasCoarsePointer() })
    : 0;
  useSurfacePaint(canvasRef, active, "editor", pxPerMm);

  const name = template.printAreas.find((area) => area.code === active)?.name ?? active;
  const percent = Math.round(zoom * 100);

  return (
    <div ref={stageRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={viewportRef}
        tabIndex={0}
        role="group"
        aria-label={`Khung vẽ ${name}`}
        aria-describedby={hintId}
        className="bg-bg-subtle focus-visible:ring-accent relative min-h-0 flex-1 touch-none overflow-auto outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset lg:min-h-80"
        {...pinch}
      >
        <div className="flex min-h-full w-max min-w-full p-6">
          <div className="relative m-auto shrink-0">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Bản thiết kế ${name}, ${count} phần tử`}
              className="block"
              style={
                bounds
                  ? { width: bounds.width * cssPxPerMm, height: bounds.height * cssPxPerMm }
                  : undefined
              }
            />
            {bounds ? (
              <>
                <InteractionOverlay
                  ref={overlayRef}
                  cssPxPerMm={cssPxPerMm}
                  bounds={bounds}
                  onActivate={focusStage}
                />
                <TextEditOverlay cssPxPerMm={cssPxPerMm} bounds={bounds} onClose={focusStage} />
              </>
            ) : null}
          </div>
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Mũi tên: dịch phần tử 0,5 mm (giữ Shift: 5 mm). Delete: xoá. Ctrl+D: nhân bản. Ctrl+] và
        Ctrl+[: đưa lên, đưa xuống. Ctrl+Z: hoàn tác. Enter: sửa chữ đang chọn. Esc: bỏ chọn.
      </p>
      <div className="border-border-default flex items-center gap-1 border-t px-2 py-1">
        <StudioIconButton
          label="Thu nhỏ"
          onClick={() => editor.setZoom(zoom / ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
        >
          <ZoomOut aria-hidden />
        </StudioIconButton>
        <output
          aria-label="Mức phóng"
          className="text-ink-secondary w-14 text-center text-sm tabular-nums"
        >
          {percent}%
        </output>
        <StudioIconButton
          label="Phóng to"
          onClick={() => editor.setZoom(zoom * ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
        >
          <ZoomIn aria-hidden />
        </StudioIconButton>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 rounded-[var(--r-md)] px-3"
          onClick={() => editor.setZoom(1)}
          disabled={zoom === 1}
        >
          <Maximize aria-hidden className="mr-1.5 size-4" />
          Vừa khung
        </Button>
      </div>
    </div>
  );
}
