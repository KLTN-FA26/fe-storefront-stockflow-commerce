"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { isWebGLAvailable } from "../../engine";
import { COLOR_DISCLAIMER } from "../color-disclaimer";
import { FlatPreview } from "./flat-preview";
import { PreviewCardHeader, type PreviewCardControls } from "./preview-card";
import { Viewer3D } from "./viewer-3d";
import { ViewerTitle } from "./viewer-toolbar";

/**
 * The live preview: the three.js model where WebGL works, else (no WebGL, the context lost for
 * good, a model that cannot be built) the flat preview with "Preview 3D không khả dụng". The
 * colour disclaimer is always below it, in full screen too (the whole panel goes full screen).
 * `productPhoto` is the product's gallery photo, shown by the flat preview. `card` is set while the
 * preview is the draft studio's corner card: it then has the card header (title, Đổi chỗ, Thu nhỏ)
 * and the view controls float over the model; without it the panel has its own title bar.
 */
export function ViewerHost({
  productPhoto,
  className,
  card,
}: {
  productPhoto?: ReactNode;
  className?: string;
  /** Present while the preview is the corner card; absent when it fills its area. */
  card?: PreviewCardControls | null;
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
      {card && <PreviewCardHeader kind="3D" {...card} />}
      {available ? (
        <Viewer3D onUnavailable={fallBack} fullscreenTarget={panelRef} compact={!!card} />
      ) : (
        <>
          {!card && <ViewerTitle />}
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
