"use client";

import { Circle, CircleCheck, CircleX, Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";

import type { SubmitStep } from "./use-design-submission";

/** The work after the confirmation, in order (spec §6.4). */
const WORK_STEPS = ["preview", "print", "spec", "upload"] as const;
export type WorkStep = (typeof WORK_STEPS)[number];
const STEP_LABELS: Record<WorkStep, string> = {
  preview: "Ảnh xem trước",
  print: "File in",
  spec: "Mô tả thiết kế",
  upload: "Tải lên",
};

export const isWorkStep = (step: SubmitStep): step is WorkStep =>
  (WORK_STEPS as readonly string[]).includes(step);

type StepState = "done" | "current" | "failed" | "todo";
const STEP_ICONS = { done: CircleCheck, current: Loader2, failed: CircleX, todo: Circle } as const;

/**
 * Where each step of a submission stands (done, under way, failed, to come), and a bar. On an
 * error, `failedAt` is the step it stopped at (none when it stopped before the first).
 */
export function SubmitSteps({
  step,
  fraction,
  failedAt,
}: {
  step: SubmitStep;
  fraction: number;
  failedAt: WorkStep | null;
}) {
  const at = step === "error" ? failedAt : isWorkStep(step) ? step : null;
  const index = step === "done" ? WORK_STEPS.length : at ? WORK_STEPS.indexOf(at) : -1;
  const progress =
    step === "done"
      ? 100
      : ((Math.max(index, 0) + (isWorkStep(step) ? fraction : 0)) / WORK_STEPS.length) * 100;
  const stateOf = (i: number): StepState =>
    i < index ? "done" : i > index ? "todo" : step === "error" ? "failed" : "current";

  // The request for review is made before anything is drawn: no file step is under way yet.
  if (step === "send") {
    return (
      <p className="text-ink-secondary flex items-center gap-2 text-sm" role="status">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Đang gửi duyệt…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {WORK_STEPS.map((item, i) => {
          const state = stateOf(i);
          const Icon = STEP_ICONS[state];
          return (
            <li
              key={item}
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex min-h-8 items-center gap-2 text-sm",
                state === "todo" ? "text-ink-tertiary" : "text-ink-primary",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  state === "done" && "text-positive",
                  state === "failed" && "text-danger",
                  state === "current" && "text-accent animate-spin",
                )}
              />
              {STEP_LABELS[item]}
            </li>
          );
        })}
      </ol>
      <Progress
        value={progress}
        role="progressbar"
        aria-label="Tiến độ gửi duyệt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      />
    </div>
  );
}
