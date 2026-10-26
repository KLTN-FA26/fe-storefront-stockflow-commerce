"use client";

import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { DESIGN_UI_STATE_META } from "../../lifecycle";
import { useStudio } from "./studio-context";

/** The notes QC (or the customer's change request) left, one tap away. */
function ReviewNotes({ notes }: { notes: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 rounded-[var(--r-md)] px-3"
        >
          <MessageSquareText aria-hidden className="size-4" />
          <span className="ml-1.5">Ghi chú QC</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Ghi chú kiểm tra"
        className="bg-bg-surface text-ink-primary border-border-default w-[min(20rem,calc(100vw-2rem))] rounded-[var(--r-lg)] shadow-[var(--sh-md)]"
      >
        <p className="text-ink-secondary mb-1 text-xs font-semibold">Ghi chú kiểm tra</p>
        <p className="text-sm whitespace-pre-line">{notes}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Where an editable design stands once QC is involved (waiting, changes asked, passed) and what an
 * edit does to it: the state's hint (its badge is in the header) and the QC notes when there are
 * some. A read-only design has the `ReadOnlyBanner` instead.
 */
export function StatusStrip() {
  const { uiState, design } = useStudio();
  const notes = design.reviewNotes?.trim();
  return (
    <section
      aria-label="Trạng thái thiết kế"
      className="bg-bg-surface border-border-default flex items-center gap-2 border-b px-[var(--card-pad)] py-1.5"
    >
      <p className="text-ink-secondary min-w-0 flex-1 text-sm">
        {DESIGN_UI_STATE_META[uiState].hint}
      </p>
      {notes ? (
        <div className="ml-auto shrink-0">
          <ReviewNotes notes={notes} />
        </div>
      ) : null}
    </section>
  );
}
