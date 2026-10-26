"use client";

import { useImperativeHandle, useRef, type Ref } from "react";

import { cn } from "@/lib/cn";

import type { PointMm, RectMm } from "../../engine";
import { selectedElement } from "./layer-labels";
import {
  HANDLE_HALF_PX,
  handleMarks,
  ROTATE_DOT_PX,
  selectionFrame,
  showsHandles,
  snapGuide,
} from "./selection-frame";
import { hasCoarsePointer } from "./stage-resolution";
import { useEditorState, useStudio } from "./studio-context";
import { useTextEditing } from "./text-editing";
import { useBrushGesture } from "./use-brush-gesture";
import { useStagePointer } from "./use-stage-pointer";

/**
 * Reach of a handle around its centre, in CSS px: 44 px across on touch screens, 24 px with a
 * mouse. Inside the element's outline a press moves the element instead (`stage-gesture.ts`).
 */
const hitRadius = () => (hasCoarsePointer() ? 22 : 12);
const CORNER_CURSORS = ["cursor-nwse-resize", "cursor-nesw-resize"] as const;

/** What the stage asks of the overlay: put down the tool gesture under way (two fingers are a pinch). */
export type OverlayHandle = { cancelGesture(): void };

const pointsAttr = (points: PointMm[]) => points.map((p) => `${p.x},${p.y}`).join(" ");

/** One handler that runs `first`, then `second`: each decides from the tool whether the event is its own. */
const both =
  <E,>(first: (event: E) => void, second: (event: E) => void) =>
  (event: E) => {
    first(event);
    second(event);
  };

/**
 * The SVG layer over the stage canvas, in the canvas's CSS px (`cssPxPerMm` from the flat mm of
 * `bounds`): the selected element's outline, its four corner scale handles and its rotate handle
 * (none for a wrapped element, R15), and the snap guides while dragging. A locked or hidden
 * element, a read-only design and the other tools get the outline only. With the select tool the
 * layer takes the pointer (`useStagePointer`, which decides from the geometry what a press is on;
 * the transparent hit circles only let a press outside the canvas reach the layer), and with the
 * brush or the eraser it takes it for drawing (`useBrushGesture`); with any other tool the
 * pointer goes through to the stage. A double click on a text opens it for editing. `ref` lets the
 * stage end the gesture of the tool when a second finger turns it into a pinch.
 */
export function InteractionOverlay({
  cssPxPerMm: k,
  bounds,
  onActivate,
  ref,
}: {
  cssPxPerMm: number;
  bounds: RectMm;
  onActivate: () => void;
  ref?: Ref<OverlayHandle>;
}) {
  const { surfaces, sizer } = useStudio();
  const element = useEditorState(selectedElement);
  const code = useEditorState((s) => s.activeSurface);
  const tool = useEditorState((s) => s.tool);
  const readOnly = useEditorState((s) => s.readOnly);
  const svgRef = useRef<SVGSVGElement>(null);
  const { start: editText } = useTextEditing();
  const r = hitRadius();
  const toFlat = (clientX: number, clientY: number): PointMm => {
    const box = svgRef.current?.getBoundingClientRect();
    return {
      x: bounds.x + (clientX - (box?.left ?? 0)) / k,
      y: bounds.y + (clientY - (box?.top ?? 0)) / k,
    };
  };
  const {
    guides,
    end: endDrag,
    handlers: select,
  } = useStagePointer({
    toFlat,
    pxPerMm: k,
    hitRadiusPx: r,
    onActivate,
    onEditText: editText,
  });
  const brush = useBrushGesture({ toFlat, onActivate });
  useImperativeHandle(ref, () => ({
    cancelGesture() {
      endDrag();
      brush.cancel();
    },
  }));
  const draws = tool === "brush" || tool === "eraser";

  const surface = surfaces.byCode[code];
  if (!(k > 0) || !surface) return null;

  const toScreen = (p: PointMm): PointMm => ({ x: (p.x - bounds.x) * k, y: (p.y - bounds.y) * k });
  const [width, height] = [bounds.width * k, bounds.height * k];
  const frame = element ? selectionFrame(element, surface, sizer(element)) : null;
  const marks =
    frame && element && showsHandles(element, { tool, readOnly }) ? handleMarks(frame, k) : null;
  const top = frame?.top ? toScreen(frame.top.at) : null;
  const rotateAt = marks?.rotate ? toScreen(marks.rotate) : null;

  return (
    <svg
      ref={svgRef}
      aria-hidden
      data-stage-overlay=""
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn(
        "absolute inset-0 size-full touch-none overflow-visible select-none",
        tool !== "select" && !draws && "pointer-events-none",
        draws && "cursor-crosshair",
      )}
      onDoubleClick={select.onDoubleClick}
      onPointerDown={both(select.onPointerDown, brush.onPointerDown)}
      onPointerMove={both(select.onPointerMove, brush.onPointerMove)}
      onPointerUp={both(select.onPointerUp, brush.onPointerUp)}
      onPointerCancel={both(select.onPointerCancel, brush.onPointerCancel)}
      onLostPointerCapture={both(select.onLostPointerCapture, brush.onLostPointerCapture)}
    >
      <rect width={width} height={height} fill="transparent" />
      {(["u", "v"] as const).map((axis) => {
        const value = guides[axis];
        return value === null ? null : (
          <polyline
            key={axis}
            points={pointsAttr(snapGuide(surface, axis, value).map(toScreen))}
            className="stroke-info pointer-events-none fill-none"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })}
      {frame ? (
        <polygon
          points={pointsAttr(frame.outline.map(toScreen))}
          className="stroke-accent pointer-events-none fill-none"
          strokeWidth={1.5}
          strokeDasharray={element?.hidden ? "4 3" : undefined}
        />
      ) : null}
      {top && rotateAt ? (
        <g data-handle="rotate">
          <line
            x1={top.x}
            y1={top.y}
            x2={rotateAt.x}
            y2={rotateAt.y}
            className="stroke-accent pointer-events-none"
            strokeWidth={1.5}
          />
          <circle cx={rotateAt.x} cy={rotateAt.y} r={r} fill="transparent" />
          <circle
            cx={rotateAt.x}
            cy={rotateAt.y}
            r={ROTATE_DOT_PX}
            className="fill-bg-surface stroke-accent cursor-grab"
            strokeWidth={1.5}
          />
        </g>
      ) : null}
      {marks
        ? marks.corners.map(toScreen).map((corner, i) => (
            <g key={i} data-handle="scale">
              <circle cx={corner.x} cy={corner.y} r={r} fill="transparent" />
              <rect
                x={corner.x - HANDLE_HALF_PX}
                y={corner.y - HANDLE_HALF_PX}
                width={2 * HANDLE_HALF_PX}
                height={2 * HANDLE_HALF_PX}
                className={cn("fill-bg-surface stroke-accent", CORNER_CURSORS[i % 2])}
                strokeWidth={1.5}
              />
            </g>
          ))
        : null}
    </svg>
  );
}
