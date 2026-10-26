"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

import { hitTest, type PointMm, type PrintAreaCode } from "../../engine";
import { canTransform, patchElement } from "./element-actions";
import { showsHandles } from "./selection-frame";
import {
  dragEdit,
  NO_GUIDES,
  press,
  type DragFrom,
  type SnapGuides,
  type StagePointer,
} from "./stage-gesture";
import { useStudio } from "./studio-context";

type Gesture = DragFrom & { pointerId: number; gestureId: string; code: PrintAreaCode };

/**
 * Pointer gestures of the select tool on the stage overlay (`stage-gesture.ts`): a press selects
 * the topmost element under it and drags it; a press on a corner handle scales (ratio kept; Shift
 * resizes an image freely) and on the rotate handle turns (Shift: 15° steps). The pointer is
 * captured, edits are applied at most once per animation frame (the last one on release), and one
 * gesture is one undo step. Nothing moves while read-only or for a locked element. A double click
 * on a text hands it to `onEditText` (the inline editor). `end` stops a drag under way where it
 * stands, as a second finger landing does (a pinch or a pan is not a drag). A drag whose pointer
 * capture is lost, or a mouse that moves with no button held (released outside the window, where
 * no `pointerup` came), ends the same way instead of sticking to the pointer.
 *
 * `toFlat` maps a pointer's client coordinates to flat mm; `pxPerMm` and `hitRadiusPx` size the
 * handles as the overlay draws them; `onActivate` focuses the stage.
 */
export function useStagePointer({
  toFlat,
  pxPerMm,
  hitRadiusPx,
  onActivate,
  onEditText,
}: {
  toFlat: (clientX: number, clientY: number) => PointMm;
  pxPerMm: number;
  hitRadiusPx: number;
  onActivate: () => void;
  onEditText: (id: string) => void;
}) {
  const { editor, surfaces, sizer } = useStudio();
  const gestureRef = useRef<Gesture | null>(null);
  const pendingRef = useRef<StagePointer | null>(null);
  const frameRef = useRef<number | null>(null);
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const step = () => {
    const gesture = gestureRef.current;
    const pointer = pendingRef.current;
    pendingRef.current = null;
    if (!gesture || !pointer) return;
    const { patch, guides: next } = dragEdit(gesture, pointer);
    patchElement(editor, { ...gesture, element: gesture.start }, patch, gesture.gestureId);
    setGuides((prev) => (prev.u === next.u && prev.v === next.v ? prev : next));
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const state = editor.store.getState();
    const code = state.activeSurface;
    const surface = surfaces.byCode[code];
    const content = state.document.surfaces[code];
    if (event.button !== 0 || state.tool !== "select" || gestureRef.current || !surface) return;
    event.preventDefault();
    onActivate();
    if (!content) return;

    const selected = content.elements.find((element) => element.id === state.selectedId);
    const { select, drag } = press({
      p: toFlat(event.clientX, event.clientY),
      withHandles: selected && showsHandles(selected, state) ? selected : undefined,
      content,
      surface,
      sizer,
      pxPerMm,
      hitRadiusPx,
    });
    if (select !== undefined) editor.select(select);
    if (!drag || !canTransform(editor, drag.start)) return;
    gestureRef.current = {
      ...drag,
      pointerId: event.pointerId,
      gestureId: editor.newId(),
      code,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    if (event.pointerType === "mouse" && event.buttons === 0) return onPointerEnd(event);
    pendingRef.current = { ...toFlat(event.clientX, event.clientY), shift: event.shiftKey };
    frameRef.current ??= requestAnimationFrame(() => {
      frameRef.current = null;
      step();
    });
  };

  /** Ends the drag under way where it stands: what was moved so far stays, as one undo step. */
  const end = () => {
    if (!gestureRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    step();
    gestureRef.current = null;
    setGuides(NO_GUIDES);
  };

  function onPointerEnd(event: PointerEvent<SVGSVGElement>) {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    end();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  /** The capture went elsewhere (or the overlay lost it) without a `pointerup`: stop where it is. */
  const onLostPointerCapture = (event: PointerEvent<SVGSVGElement>) => {
    if (gestureRef.current?.pointerId === event.pointerId) end();
  };

  const onDoubleClick = (event: MouseEvent<SVGSVGElement>) => {
    const state = editor.store.getState();
    const surface = surfaces.byCode[state.activeSurface];
    const content = state.document.surfaces[state.activeSurface];
    if (state.tool !== "select" || !surface || !content) return;
    const id = hitTest(content, surface, sizer, toFlat(event.clientX, event.clientY));
    const hit = content.elements.find((element) => element.id === id);
    if (hit?.type === "text") onEditText(hit.id);
  };

  return {
    guides,
    end,
    handlers: {
      onDoubleClick,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture,
    },
  };
}
