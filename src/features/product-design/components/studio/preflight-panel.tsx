"use client";

import {
  CircleCheck,
  CircleX,
  Info,
  MessageSquareText,
  RotateCw,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import type { PreflightIssue, PreflightLevel, PreflightReport, PrintAreaCode } from "../../engine";
import { usePreflightReport } from "./preflight-context";
import { useStudio } from "./studio-context";

const LEVELS: Record<PreflightLevel, { label: string; icon: typeof Info; tone: string }> = {
  fail: { label: "Lỗi", icon: CircleX, tone: "text-danger" },
  warning: { label: "Cảnh báo", icon: TriangleAlert, tone: "text-warning" },
  info: { label: "Lưu ý", icon: Info, tone: "text-info" },
};

/** "Đạt", "{n} cảnh báo" or "{n} lỗi": the worst level found and how often it occurs. */
function SummaryChip({ report }: { report: PreflightReport }) {
  const count = (level: PreflightLevel) => report.issues.filter((i) => i.level === level).length;
  const { text, classes } =
    report.result === "Fail"
      ? { text: `${count("fail")} lỗi`, classes: "bg-danger/10 text-danger" }
      : report.result === "Warning"
        ? { text: `${count("warning")} cảnh báo`, classes: "bg-warning/10 text-warning" }
        : { text: "Đạt", classes: "bg-positive/10 text-positive" };
  return (
    <Badge className={cn("h-7 rounded-full px-3 text-sm font-semibold tabular-nums", classes)}>
      {report.result === "Pass" ? <CircleCheck aria-hidden className="mr-1 size-4" /> : null}
      {text}
    </Badge>
  );
}

/** The messages of `issues` as a bulleted list: what a workflow dialog says is in the way. */
export function IssueMessages({ issues }: { issues: readonly PreflightIssue[] }) {
  return (
    <ul className="mt-1 list-disc pl-4">
      {issues.map((issue, i) => (
        <li key={`${issue.ruleId}-${issue.elementId ?? i}`}>{issue.message}</li>
      ))}
    </ul>
  );
}

/** One finding; with `onLocate` it is a button that shows where it is. */
function IssueRow({ issue, onLocate }: { issue: PreflightIssue; onLocate?: () => void }) {
  const { label, icon: Icon, tone } = LEVELS[issue.level];
  const body = (
    <>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <span>
        <span className="sr-only">{label}: </span>
        {issue.message}
      </span>
    </>
  );
  const row = "flex w-full items-start gap-2 rounded-[var(--r-md)] px-2 py-2.5 text-left text-sm";
  return (
    <li>
      {onLocate ? (
        <button
          type="button"
          onClick={onLocate}
          className={cn(
            row,
            "text-ink-primary hover:bg-bg-muted focus-visible:ring-accent min-h-11 outline-none focus-visible:ring-2",
          )}
        >
          {body}
        </button>
      ) : (
        <div className={cn(row, "text-ink-secondary")}>{body}</div>
      )}
    </li>
  );
}

function IssueGroup({
  title,
  issues,
  onLocate,
}: {
  title: string;
  issues: PreflightIssue[];
  onLocate?: (issue: PreflightIssue) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-ink-tertiary px-2 text-xs font-semibold">{title}</h3>
      <ul className="flex flex-col">
        {issues.map((issue, i) => (
          <IssueRow
            key={`${issue.ruleId}-${issue.elementId ?? i}`}
            issue={issue}
            {...(onLocate ? { onLocate: () => onLocate(issue) } : {})}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The "Kiểm tra" panel: the preflight summary, the notes QC left on the design, and the issues
 * grouped by print area. Clicking an issue selects its element, switches to its surface and turns
 * the 3D view to it. The checks are advisory; QC's review stays the gate.
 */
export function PreflightPanel() {
  const report = usePreflightReport();
  const { editor, surfaces, template, design, viewerRef, retryImages } = useStudio();
  const nameOf = (code: PrintAreaCode) =>
    template.printAreas.find((area) => area.code === code)?.name ?? code;
  const notes = design.reviewNotes?.trim();
  const general = report.issues.filter((issue) => !issue.surfaceCode);
  const imageFailed = report.issues.some((issue) => issue.ruleId === "ASSET_INVALID");
  const groups = surfaces.order
    .map((code) => ({ code, issues: report.issues.filter((i) => i.surfaceCode === code) }))
    .filter(({ issues }) => issues.length > 0);

  const locate = ({ surfaceCode, elementId }: PreflightIssue) => {
    if (!surfaceCode) return;
    editor.setActiveSurface(surfaceCode);
    editor.select(elementId ?? null);
    viewerRef.current?.focusSurface(surfaceCode);
  };

  return (
    <section aria-label="Kết quả kiểm tra" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink-primary text-sm font-semibold">Kiểm tra trước khi in</h2>
        <SummaryChip report={report} />
      </div>
      {notes ? (
        <div className="bg-bg-subtle border-border-default rounded-[var(--r-md)] border p-3">
          <p className="text-ink-secondary mb-1 flex items-center gap-1.5 text-xs font-semibold">
            <MessageSquareText aria-hidden className="size-4" />
            Ghi chú kiểm tra
          </p>
          <p className="text-ink-primary text-sm whitespace-pre-line">{notes}</p>
        </div>
      ) : null}
      {report.issues.length === 0 ? (
        <p className="text-ink-secondary text-sm">
          Không phát hiện vấn đề nào. QC vẫn sẽ kiểm tra lại trước khi in.
        </p>
      ) : null}
      {general.length > 0 ? <IssueGroup title="Toàn thiết kế" issues={general} /> : null}
      {groups.map(({ code, issues }) => (
        <IssueGroup key={code} title={nameOf(code)} issues={issues} onLocate={locate} />
      ))}
      {imageFailed ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-start rounded-[var(--r-md)] px-4"
          onClick={retryImages}
        >
          <RotateCw aria-hidden className="mr-1.5 size-4" />
          Tải lại ảnh
        </Button>
      ) : null}
    </section>
  );
}
