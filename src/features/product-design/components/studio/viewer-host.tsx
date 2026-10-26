"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { isWebGLAvailable } from "../../engine";
import { FlatPreview } from "./flat-preview";
import { Viewer3D } from "./viewer-3d";
import { ViewerTitle } from "./viewer-toolbar";

/** BR-07: shown with every preview, 3D or flat. */
export const COLOR_DISCLAIMER = "Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật";

/**
 * The live preview: the three.js model where WebGL works, else (no WebGL, the context lost for
 * good, a model that cannot be built) the flat preview with "Preview 3D không khả dụng". The
 * colour disclaimer is always below it, in full screen too (the whole panel goes full screen).
 * `productPhoto` is the product's gallery photo, shown by the flat preview.
 */
export function ViewerHost({
  productPhoto,
  className,
}: {
  productPhoto?: ReactNode;
  className?: string;
}) {
  // Probed once: a browser does not gain or lose WebGL while the studio is open.
  const [available, setAvailable] = useState(isWebGLAvailable);
  const fallBack = useCallback(() => setAvailable(false), []);
  const panelRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={panelRef}
      aria-label="Xem trước sản phẩm"
      className={cn(
        "bg-bg-surface border-border-default flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]",
        className,
      )}
    >
      {available ? (
        <Viewer3D onUnavailable={fallBack} fullscreenTarget={panelRef} />
      ) : (
        <>
          <ViewerTitle />
          <div className="min-h-0 flex-1">
            <FlatPreview productPhoto={productPhoto} />
          </div>
        </>
      )}
      <p className="text-ink-tertiary border-border-default border-t px-[var(--card-pad)] py-2 text-xs">
        {COLOR_DISCLAIMER}
      </p>
    </section>
  );
}
