"use client";

import { CircleCheck, CircleX, Info, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import type { PreflightReport } from "../../engine";
import { usePreflightReport } from "./preflight-context";
import { useStudioPanel } from "./studio-panel-context";

type CheckTone = "positive" | "danger" | "warning";
type CheckSummary = { text: string; tone: CheckTone };

/**
 * The report in a few words, as `PreflightPanel` groups it: "đạt" for a pass with nothing to
 * note, "N lỗi" while there are failures (`level: "fail"`), "N lưu ý" for a pass with print notes.
 */
export function summarizeCheck(report: PreflightReport): CheckSummary {
  const failures = report.issues.filter((issue) => issue.level === "fail").length;
  const notes = report.issues.filter((issue) => issue.level === "note").length;
  if (report.result === "Fail") {
    return { text: `Kiểm tra: ${Math.max(failures, 1)} lỗi`, tone: "danger" };
  }
  return notes > 0
    ? { text: `Kiểm tra: ${notes} lưu ý`, tone: "warning" }
    : { text: "Kiểm tra: đạt", tone: "positive" };
}

const TONES: Record<CheckTone, { icon: LucideIcon; classes: string }> = {
  positive: { icon: CircleCheck, classes: "bg-positive/10 text-positive" },
  danger: { icon: CircleX, classes: "bg-danger/10 text-danger" },
  warning: { icon: Info, classes: "bg-warning/10 text-warning" },
};

/** The chip itself; `onOpen` is given the chip, so the panel can give it the focus back. */
export function CheckChipView({
  summary,
  onOpen,
}: {
  summary: CheckSummary;
  onOpen: (chip: HTMLElement) => void;
}) {
  const { icon: Icon, classes } = TONES[summary.tone];
  return (
    <button
      type="button"
      data-tone={summary.tone}
      onClick={(event) => onOpen(event.currentTarget)}
      className={cn(
        "focus-visible:ring-accent inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2",
        classes,
      )}
    >
      <Icon aria-hidden className="size-4" />
      {summary.text}
    </button>
  );
}

/**
 * The header's check chip: the preflight summary, which opens the "Kiểm tra" panel (and keeps it
 * open when it already is); closing the panel gives the chip the focus back. Read-only designs
 * have the panel too, so they have the chip.
 */
export function CheckChip() {
  const report = usePreflightReport();
  const { open } = useStudioPanel();
  return <CheckChipView summary={summarizeCheck(report)} onOpen={(chip) => open("check", chip)} />;
}
