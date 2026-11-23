import { cn } from "cn";
import { Check } from "lucide-react";

import type { ProgressState, ProgressStep } from "../lifecycle";

const SR_STATE: Record<ProgressState, string> = {
  done: " (đã xong)",
  current: " (hiện tại)",
  owed: " (chưa thanh toán)",
  todo: " (chưa tới)",
};

/**
 * Horizontal progress stepper over `orderProgress` (SF-UX-30). A step the order moved past while it
 * is still unpaid (`owed`) keeps a hollow warning dot, never a tick. Room is left under each label
 * for a timestamp once the BE order history is wired in.
 */
export function OrderStepper({ steps }: { steps: readonly ProgressStep[] }) {
  return (
    <ol className="grid grid-cols-5" aria-label="Tiến trình đơn hàng">
      {steps.map((step, index) => {
        const done = step.state === "done";
        const current = step.state === "current";
        const owed = step.state === "owed";
        const reached = steps.slice(index).some((later) => later.state !== "todo");
        return (
          <li
            key={step.id}
            aria-current={current ? "step" : undefined}
            className="relative flex flex-col items-center gap-2 px-0.5 text-center"
          >
            {/* Runs edge to edge between the previous dot and this one (dots are size-6 = 1.5rem),
                so it never shows through the hollow dots. */}
            {index > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-[calc(50%+0.75rem)] h-0.5 w-[calc(100%-1.5rem)] -translate-y-1/2",
                  reached ? "bg-positive" : "bg-border-default",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-6 items-center justify-center rounded-full border-2",
                done && "border-positive bg-positive text-ink-inverse",
                current && "border-accent bg-bg-surface",
                owed && "border-warning bg-bg-surface",
                step.state === "todo" && "border-border-strong bg-bg-surface",
              )}
            >
              {done && <Check aria-hidden className="size-3.5" />}
              {current && <span className="bg-accent size-2 rounded-full" />}
              {owed && <span className="bg-warning size-2 rounded-full" />}
            </span>
            <span
              className={cn(
                "text-xs leading-tight",
                current
                  ? "text-accent font-semibold"
                  : owed
                    ? "text-warning-ink font-medium"
                    : "text-ink-secondary",
              )}
            >
              {step.label}
              <span className="sr-only">{SR_STATE[step.state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
