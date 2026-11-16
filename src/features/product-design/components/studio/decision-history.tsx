"use client";

import { Skeleton } from "@/components/shared";

import { describeDesignError } from "../../errors";
import { useDesignHistory } from "../../queries";
import { eventView } from "../../selectors";

/**
 * The design's history (docs 12 §5.3), newest first: created, submitted, returned with its reason,
 * the checks that failed, approved. Only the notes written for the customer are shown.
 */
export function DecisionHistory({ designId }: { designId: string }) {
  const history = useDesignHistory(designId);
  // The server lists events oldest first: the newest is read first here.
  const events = history.data?.toReversed() ?? [];

  return (
    <section aria-label="Lịch sử thiết kế" className="flex flex-col gap-3">
      {history.isPending ? (
        <Skeleton className="h-16 rounded-[var(--r-md)]" />
      ) : history.error ? (
        <p className="text-danger text-sm">{describeDesignError(history.error)}</p>
      ) : events.length === 0 ? (
        <p className="text-ink-secondary text-sm">Chưa có bước nào.</p>
      ) : (
        <ol className="border-border-default flex flex-col gap-3 border-l pl-4">
          {events.map((event, i) => {
            const { label, note, atLabel } = eventView(event);
            return (
              <li key={`${event.version}-${event.type}-${i}`} className="flex flex-col">
                <span className="text-ink-primary text-sm font-medium">{label}</span>
                {atLabel ? (
                  <span className="text-ink-tertiary text-xs tabular-nums">{atLabel}</span>
                ) : null}
                {note ? (
                  <span className="text-ink-secondary mt-1 text-sm whitespace-pre-line">
                    {note}
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
