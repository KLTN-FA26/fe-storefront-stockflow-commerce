"use client";

import { useCallback, useLayoutEffect, useRef, type PointerEvent, type RefObject } from "react";

import { useStudio } from "./studio-context";

/** Fingers closer than this when they land count as this far apart, so the zoom ratio stays sane. */
const MIN_SPAN_PX = 24;

type Touch = { x: number; y: number };
/**
 * Two fingers down: `span` and `zoom` are what a spread is measured against; (`fx`, `fy`) is the
 * point of the canvas under the fingers' midpoint, as fractions of its box (they do not change with
 * the zoom); `mid` is where the midpoint is now.
 */
type Pinch = {
  ids: readonly [number, number];
  span: number;
  zoom: number;
  fx: number;
  fy: number;
  mid: Touch;
};

const measure = (a: Touch, b: Touch) => ({
  mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  span: Math.hypot(a.x - b.x, a.y - b.y),
});

/**
 * Two-finger pinch zoom and pan of the stage. One finger is the active tool's; the moment a second
 * one lands, anywhere on the stage, the tool's gesture is put down (`onStart`) and the two fingers
 * drive the view instead: their spread sets the editor's zoom (relative to the zoom when they
 * landed) and their midpoint carries the canvas, so the point of the design under the fingers stays
 * under them while the view scrolls. The second finger's press never reaches the tool, and
 * neither does a third. A mouse or a pen is never a finger. A primary finger starts a new touch
 * sequence: fingers whose lift was never reported (the browser took them for scrolling, the page
 * lost focus) are forgotten then, so they cannot turn the next single finger into a pinch.
 *
 * The scroll catches up after the zoom has been laid out (`zoom` is the editor's, read by the
 * stage). Spread the fingers past the zoom limit and the spread is re-based there, so the zoom
 * answers as soon as they turn back. Returns the handlers for the stage viewport, which must take
 * no touch scrolling of its own (`touch-action: none`).
 */
export function useStagePinch({
  viewportRef,
  canvasRef,
  zoom,
  onStart,
}: {
  viewportRef: RefObject<HTMLElement | null>;
  canvasRef: RefObject<HTMLElement | null>;
  zoom: number;
  onStart: () => void;
}) {
  const { editor } = useStudio();
  const touches = useRef(new Map<number, Touch>());
  const pinch = useRef<Pinch | null>(null);
  /** A zoom change is on its way to the DOM: the scroll is set once it has been laid out. */
  const settling = useRef(false);

  /** Scrolls the viewport so the pinched point of the canvas is under the fingers' midpoint. */
  const hold = useCallback(() => {
    const grip = pinch.current;
    const scroller = viewportRef.current;
    const canvas = canvasRef.current;
    if (!grip || !scroller || !canvas) return;
    const box = canvas.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return;
    scroller.scrollLeft += box.left + grip.fx * box.width - grip.mid.x;
    scroller.scrollTop += box.top + grip.fy * box.height - grip.mid.y;
  }, [viewportRef, canvasRef]);

  useLayoutEffect(() => {
    if (!settling.current) return;
    settling.current = false;
    hold();
  }, [zoom, hold]);

  const begin = () => {
    const [first, second] = [...touches.current.entries()];
    if (!first || !second) return;
    const { mid, span } = measure(first[1], second[1]);
    const box = canvasRef.current?.getBoundingClientRect();
    const laidOut = box !== undefined && box.width > 0 && box.height > 0;
    pinch.current = {
      ids: [first[0], second[0]],
      span: Math.max(span, MIN_SPAN_PX),
      zoom: editor.store.getState().zoom,
      fx: laidOut ? (mid.x - box.left) / box.width : 0.5,
      fy: laidOut ? (mid.y - box.top) / box.height : 0.5,
      mid,
    };
    onStart();
  };

  const onPointerDownCapture = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    if (event.isPrimary) {
      touches.current.clear();
      pinch.current = null;
    }
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.current.size < 2) return;
    // The second finger (and any further one) is the pinch's, not a press for the tool.
    event.stopPropagation();
    if (!pinch.current) begin();
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const touch = touches.current.get(event.pointerId);
    if (!touch) return;
    touch.x = event.clientX;
    touch.y = event.clientY;

    const grip = pinch.current;
    const [a, b] = grip?.ids.map((id) => touches.current.get(id)) ?? [];
    if (!grip || !a || !b || !grip.ids.includes(event.pointerId)) return;
    const { mid, span } = measure(a, b);
    grip.mid = mid;

    const before = editor.store.getState().zoom;
    const wanted = (grip.zoom * span) / grip.span;
    editor.setZoom(wanted);
    const applied = editor.store.getState().zoom;
    if (applied !== wanted) {
      grip.zoom = applied;
      grip.span = Math.max(span, MIN_SPAN_PX);
    }
    if (applied !== before) settling.current = true;
    if (!settling.current) hold();
  };

  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (!touches.current.delete(event.pointerId)) return;
    if (pinch.current?.ids.includes(event.pointerId)) pinch.current = null;
  };

  return {
    onPointerDownCapture,
    onPointerMove,
    onPointerUp: onPointerEnd,
    onPointerCancel: onPointerEnd,
  };
}
