"use client";

import { CircleCheck, CircleX, Info, RotateCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import type { PreflightLevel, PreflightReport, PrintAreaCode } from "../../engine";
import type { ReportedPreflightIssue } from "../../types";
import { AskSales, needsSale } from "./ask-sales";
import { usePreflightReport } from "./preflight-context";
import { useStudio } from "./studio-context";

const LEVELS: Record<PreflightLevel, { label: string; icon: typeof Info; tone: string }> = {
  fail: { label: "Lỗi", icon: CircleX, tone: "text-danger" },
  note: { label: "Lưu ý", icon: Info, tone: "text-info" },
};

/** "Đạt", or "Không đạt" with how many issues are in the way. */
function SummaryChip({ report }: { report: PreflightReport }) {
  const failed = report.result === "Fail";
  return (
    <Badge
      className={cn(
        "h-7 rounded-full px-3 text-sm font-semibold tabular-nums",
        failed ? "bg-danger/10 text-danger" : "bg-positive/10 text-positive",
      )}
    >
      {failed ? (
        <CircleX aria-hidden className="mr-1 size-4" />
      ) : (
        <CircleCheck aria-hidden className="mr-1 size-4" />
      )}
      {failed ? "Không đạt" : "Đạt"}
    </Badge>
  );
}

/**
 * Shows where an issue is: switches to its surface, selects its element and turns the 3D view to
 * it. Issues of the whole design (no surface) have nowhere to show.
 */
export function useLocateIssue() {
  const { editor, viewerRef } = useStudio();
  return ({
    surfaceCode,
    elementId,
  }: Pick<ReportedPreflightIssue, "surfaceCode" | "elementId">) => {
    if (!surfaceCode) return;
    editor.setActiveSurface(surfaceCode);
    editor.select(elementId ?? null);
    viewerRef.current?.focusSurface(surfaceCode);
  };
}

/** One finding; with `onLocate` it is a button that shows where it is. */
function IssueRow({ issue, onLocate }: { issue: ReportedPreflightIssue; onLocate?: () => void }) {
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
            "text-ink-primary hover:bg-bg-subtle focus-visible:ring-accent min-h-11 outline-none focus-visible:ring-2",
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

/** A titled list of issues; with `onLocate`, each issue on a surface is a button that shows it. */
function IssueGroup({
  title,
  issues,
  onLocate,
}: {
  title: string;
  issues: ReportedPreflightIssue[];
  onLocate?: (issue: ReportedPreflightIssue) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-ink-tertiary px-2 text-xs font-semibold">{title}</h3>
      <ul className="flex flex-col">
        {issues.map((issue, i) => (
          <IssueRow
            key={`${issue.ruleId}-${issue.elementId ?? i}`}
            issue={issue}
            {...(onLocate && issue.surfaceCode ? { onLocate: () => onLocate(issue) } : {})}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * The failures of a preflight (the browser's, or the server's with any rule id): those of the whole
 * design first, then each print area's under its name; clicking one on a surface calls `onLocate`.
 */
export function FailedIssues({
  issues,
  onLocate,
}: {
  issues: readonly ReportedPreflightIssue[];
  onLocate: (issue: ReportedPreflightIssue) => void;
}) {
  const { surfaces, template } = useStudio();
  const nameOf = (code: PrintAreaCode) =>
    template.printAreas.find((area) => area.code === code)?.name ?? code;
  const fails = issues.filter((issue) => issue.level === "fail");
  const general = fails.filter((issue) => !issue.surfaceCode);
  const groups = surfaces.order
    .map((code) => ({ code, issues: fails.filter((i) => i.surfaceCode === code) }))
    .filter((group) => group.issues.length > 0);
  return (
    <>
      {general.length > 0 ? <IssueGroup title="Toàn thiết kế" issues={general} /> : null}
      {groups.map(({ code, issues: own }) => (
        <IssueGroup key={code} title={nameOf(code)} issues={own} onLocate={onLocate} />
      ))}
      {needsSale(fails) ? <AskSales issues={fails} /> : null}
    </>
  );
}

/**
 * The "Kiểm tra" panel: the preflight summary (Pass/Fail, spec §7), the failures grouped by print
 * area and the print notes under "Lưu ý khi in". Clicking an issue selects its element, switches
 * to its surface and turns the 3D view to it. A Fail blocks "Gửi duyệt"; a note never does.
 * `heading={false}` leaves out its own title when the container already carries it.
 */
export function PreflightPanel({ heading = true }: { heading?: boolean } = {}) {
  const report = usePreflightReport();
  const { retryImages } = useStudio();
  const locate = useLocateIssue();
  const printNotes = report.issues.filter((issue) => issue.level === "note");
  const imageFailed = report.issues.some((issue) => issue.ruleId === "ASSET_INVALID");

  return (
    <section aria-label="Kết quả kiểm tra" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ? (
          <h2 className="text-ink-primary text-sm font-semibold">Kiểm tra trước khi in</h2>
        ) : null}
        <SummaryChip report={report} />
      </div>
      {report.issues.length === 0 ? (
        <p className="text-ink-secondary text-sm">
          Không phát hiện vấn đề nào. Thiết kế vẫn được duyệt lại trước khi in.
        </p>
      ) : null}
      <FailedIssues issues={report.issues} onLocate={locate} />
      {printNotes.length > 0 ? (
        <IssueGroup title="Lưu ý khi in" issues={printNotes} onLocate={locate} />
      ) : null}
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
