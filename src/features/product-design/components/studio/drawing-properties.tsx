"use client";

import type { DrawingElement } from "../../engine";
import type { PropertySectionProps } from "./property-sections";

/**
 * The drawing's own section of the Properties panel: how many strokes it holds. Its name, place and
 * opacity are the common fields above; the strokes themselves are drawn and erased with the Vẽ and
 * Tẩy tools.
 */
export function DrawingProperties({ element }: PropertySectionProps<DrawingElement>) {
  const erased = element.strokes.filter((stroke) => stroke.mode === "erase").length;
  const drawn = element.strokes.length - erased;
  return (
    <div className="border-border-default flex flex-col gap-1.5 border-t pt-4">
      <h3 className="text-ink-primary text-sm font-semibold">Nét vẽ</h3>
      <p className="text-ink-secondary text-sm tabular-nums">
        {drawn} nét vẽ{erased > 0 ? `, ${erased} lần tẩy` : ""}
      </p>
      <p className="text-ink-tertiary text-xs">
        Chọn công cụ Vẽ hoặc Tẩy (phím B, E) để thêm hoặc xoá nét trong lớp này.
      </p>
    </div>
  );
}
