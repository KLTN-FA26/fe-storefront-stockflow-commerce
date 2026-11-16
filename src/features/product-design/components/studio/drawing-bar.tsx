"use client";

import { useId } from "react";

import type { DrawingElement } from "../../engine";
import type { PropertySectionProps } from "./property-sections";

const HINT = "Chọn công cụ Vẽ hoặc Tẩy (phím B, E) để thêm hoặc xoá nét trong lớp này.";

/**
 * The drawing's note in the context bar: how many strokes it holds. Its name, place and opacity are
 * the common controls; the strokes themselves are drawn and erased with the Vẽ and Tẩy tools.
 */
export function DrawingBar({ element }: PropertySectionProps<DrawingElement>) {
  const hintId = useId();
  const erased = element.strokes.filter((stroke) => stroke.mode === "erase").length;
  const drawn = element.strokes.length - erased;
  return (
    <>
      <p
        aria-describedby={hintId}
        title={HINT}
        className="text-ink-secondary shrink-0 text-sm tabular-nums"
      >
        {drawn} nét vẽ{erased > 0 ? `, ${erased} lần tẩy` : ""}
      </p>
      <span id={hintId} className="sr-only">
        {HINT}
      </span>
    </>
  );
}
