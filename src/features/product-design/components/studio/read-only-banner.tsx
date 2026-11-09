"use client";

import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The line under the header of a design that cannot be edited (PENDING_REVIEW, APPROVED): "Chỉ
 * xem.", where it stands (`children`) and, when there is one, what the customer can take from it
 * (`action`). The status badge is in the header.
 */
export function ReadOnlyBanner({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <section
      aria-label="Trạng thái thiết kế"
      className="bg-bg-surface border-border-default flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-[var(--card-pad)] py-1.5"
    >
      <p className="text-ink-secondary flex min-w-0 flex-1 items-center gap-2 text-sm">
        <Lock aria-hidden className="size-4 shrink-0" />
        <strong className="text-ink-primary shrink-0">Chỉ xem.</strong>
        <span className="min-w-0">{children}</span>
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}
