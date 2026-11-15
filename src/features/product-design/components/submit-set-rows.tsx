"use client";

import { Circle, CircleAlert, CircleCheck, CircleX, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { designCardView } from "../selectors";
import type { Design } from "../types";
import type { BundleStep } from "./studio/submission-bundle";
import type { RowState } from "./submit-set-run";

const DRAW_STEPS: readonly BundleStep[] = ["preview", "print", "spec"];
const DRAW_LABELS: Record<BundleStep, string> = {
  preview: "Đang dựng ảnh xem trước…",
  print: "Đang dựng file in…",
  spec: "Đang dựng đặc tả…",
};

type Status = { label: string; icon: typeof Circle; tone: string; spin?: boolean };

function statusOf(row: RowState): Status {
  const busy = { icon: Loader2, tone: "text-accent", spin: true };
  switch (row.kind) {
    case "waiting":
      return { label: "Chờ kiểm tra", icon: Circle, tone: "text-ink-tertiary" };
    case "checking":
      return { label: "Đang kiểm tra…", ...busy };
    case "passed":
      return { label: "Đạt", icon: CircleCheck, tone: "text-positive" };
    case "failed":
      return { label: "Không đạt", icon: CircleX, tone: "text-danger" };
    case "drawing":
      return { label: DRAW_LABELS[row.step], ...busy };
    case "uploading":
      return { label: "Đang tải lên…", ...busy };
    case "uploaded":
      return { label: "Đã tải lên", icon: CircleCheck, tone: "text-positive" };
    case "stopped":
      return { label: "Đã dừng", icon: CircleAlert, tone: "text-danger" };
  }
}

/** The drawing's progress over its three files, in percent. */
const drawn = (step: BundleStep, fraction: number) =>
  ((DRAW_STEPS.indexOf(step) + fraction) / DRAW_STEPS.length) * 100;

/** A design that did not pass: what fails, and the studio to fix it in. */
function FailedChecks({ designId, row }: { designId: string; row: RowState & { kind: "failed" } }) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {row.issues.map((issue, i) => (
          <li
            key={`${issue.ruleId}-${issue.elementId ?? i}`}
            className="text-ink-primary flex items-start gap-2 text-sm"
          >
            <CircleX aria-hidden className="text-danger mt-0.5 size-4 shrink-0" />
            {issue.message}
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" className="min-h-11 self-start rounded-[var(--r-md)] px-4">
        <Link href={STORE_ROUTES.design.detail(designId)}>Mở studio để sửa</Link>
      </Button>
    </div>
  );
}

/** A design that passed with print notes (e.g. CMYK): shown before the customer confirms. */
function PrintNotes({ row }: { row: RowState & { kind: "passed" } }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-ink-tertiary text-xs font-semibold">Lưu ý khi in</h3>
      <ul className="flex flex-col gap-1">
        {row.notes.map((note, i) => (
          <li
            key={`${note.ruleId}-${note.elementId ?? i}`}
            className="text-ink-secondary flex items-start gap-2 text-sm"
          >
            <Info aria-hidden className="text-info mt-0.5 size-4 shrink-0" />
            {note.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SetRow({ design, row }: { design: Design; row: RowState }) {
  const titleId = useId();
  const { title, subtitle } = designCardView(design);
  const { label, icon: Icon, tone, spin } = statusOf(row);
  return (
    <li
      aria-labelledby={titleId}
      className="bg-bg-surface border-border-default flex flex-col gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--sh-sm)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={titleId} className="text-ink-primary truncate text-base font-semibold">
            {title}
          </h2>
          <p className="text-ink-secondary text-sm">{subtitle}</p>
        </div>
        <p className={cn("flex min-h-6 items-center gap-1.5 text-sm font-medium", tone)}>
          <Icon aria-hidden className={cn("size-4 shrink-0", spin && "animate-spin")} />
          {label}
        </p>
      </div>
      {row.kind === "drawing" ? (
        <Progress
          value={drawn(row.step, row.fraction)}
          role="progressbar"
          aria-label={`Tiến độ ${title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(drawn(row.step, row.fraction))}
        />
      ) : null}
      {row.kind === "stopped" ? <p className="text-danger text-sm">{row.message}</p> : null}
      {row.kind === "failed" ? <FailedChecks designId={design.id} row={row} /> : null}
      {row.kind === "passed" && row.notes.length > 0 ? <PrintNotes row={row} /> : null}
    </li>
  );
}

/** One row per design of the set: its name, variant, where it stands, and what is in its way. */
export function SetRows({
  designs,
  rows,
}: {
  designs: readonly Design[];
  rows: Readonly<Record<string, RowState>>;
}) {
  return (
    <ol aria-label="Các bản gửi duyệt" className="flex flex-col gap-3">
      {designs.map((design) => (
        <SetRow key={design.id} design={design} row={rows[design.id] ?? { kind: "waiting" }} />
      ))}
    </ol>
  );
}
