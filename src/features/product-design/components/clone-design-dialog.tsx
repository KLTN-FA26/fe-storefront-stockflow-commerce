"use client";

import { useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";

import type { Design } from "../types";
import { CloneForm } from "./clone-design-form";
import type { ProductSkusLoader } from "./clone-design-targets";

type CloneDesignDialogProps = {
  /** The design to copy; null while no dialog is wanted. */
  design: Design | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The page way to the variants of a product (the catalogue); without it nothing is offered. */
  skusOf?: ProductSkusLoader | undefined;
};

/**
 * "Nhân bản sang cỡ khác" (spec 2026-11-12 §7): the other variants of the design product that
 * take designs; the layout is re-fitted to the one picked and the server makes the copy. While a
 * copy is being made the dialog cannot be closed, so the customer always reaches it.
 */
export function CloneDesignDialog({ design, open, onOpenChange, skusOf }: CloneDesignDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open && design !== null}
      // Esc, a click outside and the close button all come through here.
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
    >
      <DialogContent
        showCloseButton={!busy}
        className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md"
      >
        {/* Unmounts with the dialog: it opens again with nothing chosen. */}
        {design ? (
          <CloneForm
            design={design}
            skusOf={skusOf}
            busy={busy}
            onBusyChange={setBusy}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
