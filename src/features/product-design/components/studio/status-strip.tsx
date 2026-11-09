"use client";

import { MessageSquareWarning } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The line under the header of a draft the customer must act on: a returned draft's reason
 * (`children`), in the warning tone of its "Bị trả lại" badge. Long reasons wrap; the line keeps
 * at most a few rows, scrolling beyond that.
 */
export function StatusStrip({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Trạng thái thiết kế"
      className="bg-warning/10 border-border-default max-h-24 overflow-y-auto border-b px-[var(--card-pad)] py-1.5"
    >
      <p className="text-ink-primary flex min-w-0 items-start gap-2 text-sm">
        <MessageSquareWarning aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 whitespace-pre-line">{children}</span>
      </p>
    </section>
  );
}
