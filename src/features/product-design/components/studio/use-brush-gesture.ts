"use client";

import { useEffect, useRef, type PointerEvent } from "react";

import { applyToPoint, type PointMm } from "../../engine";
import { beginInking, pressureOf, strokeOf, withStroke, type Inking } from "./brush-actions";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useStudio } from "./studio-context";

type Sample = { clientX: number; clientY: number; pressure: number };

/**
 * The brush and eraser on the stage overlay. A press with the brush starts a stroke in the
 * selected drawing, or in a new "Nét vẽ n" placed where the press is (the new drawing becomes the
 * selection, so the next strokes join it); a press with the eraser cuts the drawing of
 * `eraserTarget` and does nothing without one. Points are read in the drawing's local mm through
 * the inverse of its matrix, with the pointer's pressure (a mouse or a touch screen reports none:
 * 0.5). The stroke is shown by the live preview, at most once per animation frame, and committed
 * on release: simplified, as one undo step under its own `gestureId`. A second finger is a pinch
 * or a pan, so it drops a stroke a finger draws without a trace (R61, narrowed: a pen stroke goes
 * on under a resting palm; the stage calls `cancel` when two fingers are down, wherever the second
 * one lands), as does `pointercancel`. A stroke whose pointer capture is lost, or a mouse moving
 * with no button held (released outside the window), is committed as if released there. Nothing
 * draws while read-only.
 *
 * `toFlat` maps a pointer's client coordinates to flat mm; `onActivate` focuses the stage.
 */
export function useBrushGesture({
  toFlat,
  onActivate,
}: {
  toFlat: (clientX: number, clientY: number) => PointMm;
  onActivate: () => void;
}) {
  const { editor, surfaces, livePreview, announce } = useStudio();
  const inkingRef = useRef<Inking | null>(null);
  /** The kind of pointer drawing the stroke: only a finger's stroke gives way to a second finger. */
  const pointerTypeRef = useRef<string>("");
  const frameRef = useRef<number | null>(null);

  const stopFrame = () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };
  /** Forgets the stroke and takes its preview off the views. */
  const drop = () => {
    stopFrame();
    const inking = inkingRef.current;
    inkingRef.current = null;
    if (inking) livePreview.show(null, inking.code);
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      const inking = inkingRef.current;
      inkingRef.current = null;
      if (inking) livePreview.show(null, inking.code);
    },
    [livePreview],
  );

  const preview = () => {
    const inking = inkingRef.current;
    if (!inking) return;
    const { document } = editor.store.getState();
    livePreview.show(
      withStroke(document, inking.code, inking.target, strokeOf(inking)),
      inking.code,
    );
  };
  const schedulePreview = () => {
    frameRef.current ??= requestAnimationFrame(() => {
      frameRef.current = null;
      preview();
    });
  };

  const addSample = (inking: Inking, sample: Sample) => {
    const local = applyToPoint(inking.toLocal, toFlat(sample.clientX, sample.clientY));
    const last = inking.points.at(-1);
    if (last?.[0] === local.x && last[1] === local.y) return;
    inking.points.push([local.x, local.y, pressureOf(sample.pressure)]);
  };

  const commit = (inking: Inking) => {
    const stroke = strokeOf(inking);
    const { code, gestureId, target } = inking;
    editor.apply((doc) => withStroke(doc, code, target, stroke), { gestureId });
    livePreview.show(null, code);
    const added = editor.store
      .getState()
      .document.surfaces[code]?.elements.some((element) => element.id === target.drawing.id);
    if (target.isNew && added) {
      editor.select(target.drawing.id);
      announce(STUDIO_ANNOUNCEMENTS.drawingAdded);
    }
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const state = editor.store.getState();
    const { tool } = state;
    if ((tool !== "brush" && tool !== "eraser") || state.readOnly || event.button !== 0) return;
    if (inkingRef.current) {
      const fingerStroke = pointerTypeRef.current === "touch";
      if (
        fingerStroke &&
        event.pointerType === "touch" &&
        event.pointerId !== inkingRef.current.pointerId
      ) {
        drop();
      }
      return;
    }
    event.preventDefault();
    onActivate();

    const surface = surfaces.byCode[state.activeSurface];
    const inking =
      surface &&
      beginInking({
        state,
        surface,
        at: toFlat(event.clientX, event.clientY),
        pointerId: event.pointerId,
        newId: editor.newId,
      });
    if (!inking) return;
    addSample(inking, event.nativeEvent);
    inkingRef.current = inking;
    pointerTypeRef.current = event.pointerType;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    schedulePreview();
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const inking = inkingRef.current;
    if (inking?.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) return onPointerUp(event);
    // A pen reports several positions per frame; the browser hands them over together.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of coalesced.length > 0 ? coalesced : [event.nativeEvent]) {
      addSample(inking, sample);
    }
    schedulePreview();
  };

  /** Puts the stroke down as it stands. */
  const finish = () => {
    const inking = inkingRef.current;
    if (!inking) return;
    stopFrame();
    inkingRef.current = null;
    commit(inking);
  };

  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (inkingRef.current?.pointerId !== event.pointerId) return;
    finish();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  /** The capture went elsewhere without a `pointerup`: what was drawn so far is kept. */
  const onLostPointerCapture = (event: PointerEvent<SVGSVGElement>) => {
    if (inkingRef.current?.pointerId === event.pointerId) finish();
  };

  /** Two fingers on the stage are a pinch: a finger's stroke is dropped, a pen's goes on. */
  const cancel = () => {
    if (pointerTypeRef.current === "touch") drop();
  };

  const onPointerCancel = (event: PointerEvent<SVGSVGElement>) => {
    if (inkingRef.current?.pointerId !== event.pointerId) return;
    drop();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    cancel,
  };
}
