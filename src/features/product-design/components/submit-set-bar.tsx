"use client";

import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";

import { MIN_SET_SIZE, type Gate } from "../project-rules";
import { useDeviceFit } from "./desktop-only-gate";

type SubmitSetBarProps = {
  projectId: string;
  /** The ids of the chosen DRAFT designs. */
  chosen: readonly string[];
  /** The project's own answer (`projectActions(...).submitSet`). */
  gate: Gate;
};

/** The first reason that stops the set from going: the project's, else too few chosen. */
const blockedReason = (gate: Gate, chosen: number) => {
  if (!gate.allowed) return gate.reason ?? null;
  return chosen < MIN_SET_SIZE ? `Chọn ít nhất ${MIN_SET_SIZE} bản nháp để gửi cả bộ` : null;
};

/**
 * Sticky at the bottom of the project page (spec 2026-11-12 §8): how many drafts are chosen and
 * "Gửi duyệt cả bộ", which opens the desktop submit page for them. Locked, with its reason, below
 * two drafts. The submit page is desktop-only, so a phone is told.
 */
export function SubmitSetBar({ projectId, chosen, gate }: SubmitSetBarProps) {
  const reason = blockedReason(gate, chosen.length);
  // The same test as the gate: a tablet in landscape is wide enough and still told.
  const needsComputer = useDeviceFit() !== "desktop";
  const reasonId = "submit-set-reason";
  return (
    <div className="bg-bg-surface border-border-default sticky bottom-0 z-30 -mx-4 mt-6 border-t px-4 py-3 shadow-[var(--sh-md)] sm:mx-0 sm:rounded-[var(--r-lg)] sm:border">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-primary text-sm font-semibold tabular-nums">
          Đã chọn {chosen.length} bản nháp
        </p>
        {reason === null ? (
          <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
            <Link href={STORE_ROUTES.design.projectSubmit(projectId, chosen)}>Gửi duyệt cả bộ</Link>
          </Button>
        ) : (
          <Button
            type="button"
            disabled
            aria-describedby={reasonId}
            className="min-h-11 rounded-[var(--r-md)] px-5"
          >
            Gửi duyệt cả bộ
          </Button>
        )}
      </div>
      {reason !== null ? (
        <p id={reasonId} className="text-ink-secondary mt-2 text-sm">
          {reason}
        </p>
      ) : null}
      {needsComputer ? (
        <p className="text-ink-tertiary mt-2 text-xs">Cần máy tính để gửi duyệt cả bộ</p>
      ) : null}
    </div>
  );
}
