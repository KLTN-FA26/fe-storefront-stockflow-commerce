"use client";

import { History } from "lucide-react";

import { Skeleton } from "@/components/shared";

import { describeDesignError } from "../../errors";
import { useDesignHistory } from "../../queries";
import { decisionView } from "../../selectors";

/** The design's decisions, newest first: who moved it on and when (`GET /designs/{id}/history`). */
export function DecisionHistory({ designId }: { designId: string }) {
  const history = useDesignHistory(designId);
  const items = history.data?.items.toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at)) ?? [];

  return (
    <section aria-label="Lịch sử thiết kế" className="flex flex-col gap-3">
      <h2 className="text-ink-primary flex items-center gap-1.5 text-sm font-semibold">
        <History aria-hidden className="size-4" />
        Lịch sử
      </h2>
      {history.isPending ? (
        <Skeleton className="h-16 rounded-[var(--r-md)]" />
      ) : history.error ? (
        <p className="text-danger text-sm">{describeDesignError(history.error)}</p>
      ) : items.length === 0 ? (
        <p className="text-ink-secondary text-sm">Chưa có bước nào.</p>
      ) : (
        <ol className="border-border-default flex flex-col gap-3 border-l pl-4">
          {items.map((item) => {
            const { label, notes, atLabel } = decisionView(item);
            return (
              <li key={`${item.version}-${item.decision}-${item.at}`} className="flex flex-col">
                <span className="text-ink-primary text-sm font-medium">{label}</span>
                {atLabel ? (
                  <span className="text-ink-tertiary text-xs tabular-nums">{atLabel}</span>
                ) : null}
                {notes ? (
                  <span className="text-ink-secondary mt-1 text-sm whitespace-pre-line">
                    {notes}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
