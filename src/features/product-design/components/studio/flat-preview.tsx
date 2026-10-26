"use client";

import { MonitorX } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { useEditorState, useStudio } from "./studio-context";
import { useSurfacePaint } from "./use-surface-paint";

/** Longest edge of the flat composite, in bitmap px (CSS scales it into the panel). */
const FLAT_PREVIEW_PX = 1024;

/**
 * The 2D stand-in for the 3D view (no WebGL, the context lost for good, or a model that cannot be
 * built): the active surface composed as on the product (kraft tint included), with the product
 * photo beside it when there is one.
 */
export function FlatPreview({ productPhoto }: { productPhoto?: ReactNode }) {
  const { surfaces, template } = useStudio();
  const active = useEditorState((s) => s.activeSurface);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bounds = surfaces.byCode[active]?.flatBounds;
  const longest = bounds ? Math.max(bounds.width, bounds.height) : 1;
  useSurfacePaint(canvasRef, active, "preview", FLAT_PREVIEW_PX / longest);
  const name = template.printAreas.find((area) => area.code === active)?.name ?? active;

  return (
    <div className="flex h-full flex-col gap-3 p-[var(--card-pad)]">
      <p className="text-ink-secondary flex items-center gap-2 text-sm font-medium">
        <MonitorX aria-hidden className="size-4" />
        Preview 3D không khả dụng
      </p>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="relative min-h-48 flex-1">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Bản xem trước phẳng: ${name}`}
            className="absolute inset-0 block size-full object-contain"
          />
        </div>
        {productPhoto}
      </div>
    </div>
  );
}
