"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { COLOR_DISCLAIMER } from "../color-disclaimer";
import { CanvasStage } from "./canvas-stage";
import { CARD_BOX } from "./card-box";
import { ImagePaste } from "./image-paste";
import {
  CARD_MINIMISE_SELECTOR,
  CARD_PILL_SELECTOR,
  CARD_SWAP_SELECTOR,
  PreviewCardHeader,
  PreviewPill,
} from "./preview-card";
import { SurfaceSwitcher } from "./surface-switcher";
import { ViewerHost } from "./viewer-host";

const STAGE_CARD =
  "bg-bg-surface border-border-default flex min-h-0 flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--sh-sm)]";
const FILL = "absolute inset-0";
/**
 * The stage as the small card is a glance view (zoom belongs to the full stage). CanvasStage is
 * not edited for this, so the section reaches in through descendant selectors, coupled to what
 * CanvasStage renders: its viewport is the `role="group"` box (which has `lg:min-h-80`, taller
 * than the card), and its zoom bar is the box holding the "Mức phóng" readout.
 */
const STAGE_AS_CARD = "lg:[&_[role=group]]:min-h-0 [&_div:has(>[aria-label='Mức_phóng'])]:hidden";
const CORNER = `${CARD_BOX} flex-none shadow-[var(--sh-md)]`;
/** Read-only: the stage (under its face strip) and the preview share the width. */
const SPLIT = "grid grid-cols-[minmax(17rem,1fr)_minmax(22rem,1.35fr)] gap-3";

/**
 * The 3D view's full screen ends before the card changes: hidden or moved, the full-screen element
 * would leave a blank screen, and the button that takes focus would sit behind it.
 */
function leaveFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
}

/**
 * The stage and the 3D preview, siblings in one area, in both of the design's states, so that a
 * design changing status keeps them mounted (the WebGL canvas and the stage's canvases stay the
 * same nodes, and so does the focus in them). A draft: one of them fills the area and the other is
 * the corner card; Đổi chỗ changes which, by class alone, so neither is moved or re-keyed (the
 * stage keeps its zoom and selection). Thu nhỏ folds the card into a pill and keeps it mounted,
 * hidden by class. Both flags are local UI state, not persisted. Read-only: no card; the stage,
 * with the print-area switcher above it (a bag has four faces), and the preview side by side; the
 * flags go back to "not swapped, not minimised", so a design returned as a draft starts there. A
 * draft also hears an image pasted on the stage while the image options are closed (`ImagePaste`).
 */
export function StageArea({
  productPhoto,
  readOnly,
}: {
  productPhoto?: ReactNode;
  readOnly: boolean;
}) {
  const [swapped, setSwapped] = useState(false);
  const [minimised, setMinimised] = useState(false);
  if (readOnly && (swapped || minimised)) {
    setSwapped(false);
    setMinimised(false);
  }
  const areaRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);

  // Focus follows the button that was pressed, once the new card is on screen.
  useEffect(() => {
    const selector = focusNext.current;
    focusNext.current = null;
    if (selector) areaRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [swapped, minimised]);

  const swap = () => {
    leaveFullscreen();
    focusNext.current = CARD_SWAP_SELECTOR;
    setSwapped((value) => !value);
  };
  const minimise = () => {
    leaveFullscreen();
    focusNext.current = CARD_PILL_SELECTOR;
    setMinimised(true);
  };
  const restore = () => {
    focusNext.current = CARD_MINIMISE_SELECTOR;
    setMinimised(false);
  };
  const controls = { onSwap: swap, onMinimise: minimise };
  const cardClass = minimised ? "hidden" : CORNER;

  return (
    <div ref={areaRef} className={cn("min-h-0 min-w-0 flex-1", readOnly ? SPLIT : "relative")}>
      <section
        aria-label="Khung thiết kế"
        data-card={swapped ? "" : undefined}
        className={cn(STAGE_CARD, !readOnly && (swapped ? [cardClass, STAGE_AS_CARD] : FILL))}
      >
        {readOnly ? (
          <div className="border-border-default flex h-11 shrink-0 items-center border-b px-2">
            <SurfaceSwitcher />
          </div>
        ) : swapped ? (
          <PreviewCardHeader kind="2D" {...controls} />
        ) : null}
        <CanvasStage />
        <p className="text-ink-tertiary border-border-default shrink-0 border-t px-3 py-1.5 text-xs">
          {COLOR_DISCLAIMER}
        </p>
      </section>
      <ViewerHost
        productPhoto={productPhoto}
        card={readOnly || swapped ? null : controls}
        className={readOnly ? "min-h-[18rem]" : swapped ? FILL : cardClass}
      />
      {minimised && <PreviewPill kind={swapped ? "2D" : "3D"} onRestore={restore} />}
      {readOnly ? null : <ImagePaste />}
    </div>
  );
}
