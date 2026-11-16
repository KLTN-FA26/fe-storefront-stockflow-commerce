"use client";

import { MessageSquareWarning } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The line under the header of a draft the customer must act on: a returned draft's reason
 * (`children`), in the warning tone of its "Bị trả lại" badge. Long reasons wrap; the line keeps
 * at most a few rows, scrolling beyond that — focusable, so the keyboard can scroll it too.
 */
export function StatusStrip({ children }: { children: ReactNode }) {
  return (
    <section
      role="region"
      aria-label="Trạng thái thiết kế"
      tabIndex={0}
      className="bg-warning/10 border-border-default focus-visible:ring-ring/50 max-h-24 overflow-y-auto border-b px-[var(--card-pad)] py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-inset"
    >
      <p className="text-ink-primary flex min-w-0 items-start gap-2 text-sm">
        <MessageSquareWarning aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 whitespace-pre-line">{children}</span>
      </p>
    </section>
  );
}
