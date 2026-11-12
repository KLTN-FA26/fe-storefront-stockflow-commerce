"use client";

import { ArrowLeftRight, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { StudioIconButton } from "./studio-icon-button";

/** What the corner card's header drives; the stage area owns the state. */
export type PreviewCardControls = {
  onSwap: () => void;
  onMinimise: () => void;
};

/** Which view is the card: its title, and what its buttons call it. */
const CARDS = {
  "3D": { title: "Xem 3D", object: "bản xem trước" },
  "2D": { title: "Khung thiết kế", object: "khung thiết kế" },
} as const;
export type PreviewCardKind = keyof typeof CARDS;

/** Selectors the stage area uses to move focus to the card's buttons. */
export const CARD_SWAP_SELECTOR = "[data-card-swap]";
export const CARD_MINIMISE_SELECTOR = "[data-card-minimise]";
export const CARD_PILL_SELECTOR = "[data-card-pill]";

/**
 * The header of whichever view is the corner card, "Xem 3D" (the 3D preview) or "Khung thiết kế"
 * (the 2D sheet): its title, then Đổi chỗ (the two views change places) and Thu nhỏ (the card folds
 * to a pill), which names the view. Each button's tooltip is its label (no `title` as well: that
 * would show a second one).
 */
export function PreviewCardHeader({
  kind,
  onSwap,
  onMinimise,
}: { kind: PreviewCardKind } & PreviewCardControls) {
  const { title, object } = CARDS[kind];
  return (
    <div className="border-border-default flex min-h-11 shrink-0 items-center justify-between gap-1 border-b pl-3">
      <h2 className="text-ink-primary truncate text-sm font-semibold">{title}</h2>
      <div className="flex items-center">
        <StudioIconButton label="Đổi chỗ 2D và 3D" data-card-swap="" onClick={onSwap}>
          <ArrowLeftRight aria-hidden />
        </StudioIconButton>
        <StudioIconButton label={`Thu nhỏ ${object}`} data-card-minimise="" onClick={onMinimise}>
          <Minimize2 aria-hidden />
        </StudioIconButton>
      </div>
    </div>
  );
}

/** The minimised card: a pill in the card's corner, reading "2D" or "3D", that restores it. */
export function PreviewPill({ kind, onRestore }: { kind: PreviewCardKind; onRestore: () => void }) {
  const label = `Mở lại ${CARDS[kind].object}`;
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      title={label}
      data-card-pill=""
      onClick={onRestore}
      className="bg-bg-surface text-ink-primary focus-visible:ring-accent absolute right-3 bottom-3 z-10 min-h-11 min-w-11 rounded-full px-3 text-sm font-semibold shadow-[var(--sh-md)] focus-visible:ring-2"
    >
      {kind}
    </Button>
  );
}
