"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { STORE_ROUTES } from "@/constants";
import { cn } from "@/lib/cn";

import { MIN_SET_SIZE } from "../project-rules";
import { RetryButton } from "./design-list-states";
import type { Announcement, SetState } from "./submit-set-state";

// The frame of the set submission page, its header and steps, and what it shows when there is no
// set to send. The page lives in the studio route group, which has no storefront header: it frames
// itself.

/** A design chosen on the project page that is not sent: no longer a draft of the project. */
export type LeftOut = { id: string; name: string | null; reason: string };

export function SetFrame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">{children}</main>
  );
}

/** The designs chosen but not sent, and why: the customer chose them (docs 12 §4.10). */
function LeftOutNote({ left }: { left: readonly LeftOut[] }) {
  return (
    <Alert tone="warning" title={`${left.length} bản đã chọn không được gửi`}>
      <ul className="flex flex-col gap-0.5">
        {left.map(({ id, name, reason }) => (
          <li key={id}>{name ? `${name}: ${reason}` : reason}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** The title, the way back to the project (leaving sends nothing), and the designs left out. */
export function SetHeader({
  projectId,
  name,
  count,
  left,
}: {
  projectId: string;
  name: string;
  count: number;
  left: readonly LeftOut[];
}) {
  return (
    <header className="flex flex-col gap-2">
      <Button asChild variant="ghost" className="min-h-11 self-start rounded-[var(--r-md)] px-2">
        <Link href={STORE_ROUTES.design.project(projectId)} replace>
          <ArrowLeft aria-hidden className="size-4" />
          {name}
        </Link>
      </Button>
      <h1 className="font-display text-ink-primary text-2xl font-semibold">Gửi duyệt cả bộ</h1>
      <p className="text-ink-secondary text-sm">
        {count} bản nháp được kiểm tra và gửi cùng lúc: bản nào chưa đạt thì không bản nào được gửi.
      </p>
      {left.length > 0 ? <LeftOutNote left={left} /> : null}
    </header>
  );
}

const STEPS = ["Kiểm tra", "Xác nhận", "Dựng và tải lên", "Mở lượt duyệt"] as const;

/** The four steps of a set submission (spec §8), the one reached marked. */
export function SetSteps({ step }: { step: SetState["step"] }) {
  return (
    <ol aria-label="Các bước gửi duyệt cả bộ" className="flex flex-wrap gap-x-5 gap-y-2">
      {STEPS.map((label, i) => {
        const at = i + 1;
        const state = at < step ? "done" : at === step ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 text-sm",
              state === "todo" ? "text-ink-tertiary" : "text-ink-primary",
              state === "current" && "font-semibold",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs tabular-nums",
                state === "current"
                  ? "bg-accent text-ink-inverse border-transparent"
                  : "border-border-default",
              )}
            >
              {at}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The run's milestones for a screen reader (WCAG 4.1.3), as the studio's announcer: polite, each
 * a new node so the same words said twice are read twice.
 */
export function SetAnnouncer({ announcement }: { announcement: Announcement | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label="Tiến độ gửi duyệt"
      className="sr-only"
    >
      {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
    </div>
  );
}

const backTo = (projectId: string) => (
  <Button asChild className="min-h-11 rounded-[var(--r-md)] px-5">
    <Link href={STORE_ROUTES.design.project(projectId)} replace>
      Về dự án
    </Link>
  </Button>
);

/** docs 12 BR-22: a closed project sends no set. */
export function SetClosed({ projectId }: { projectId: string }) {
  return (
    <EmptyState
      title="Dự án đã đóng"
      description="Dự án đã đóng nên không gửi duyệt cả bộ được nữa. Các bản bên trong vẫn gửi lẻ được."
      action={backTo(projectId)}
    />
  );
}

/** docs 12 BR-19: a set is 2 drafts or more; the others chosen are no longer drafts of it. */
export function SetTooSmall({ projectId }: { projectId: string }) {
  return (
    <EmptyState
      title={`Cần ít nhất ${MIN_SET_SIZE} bản nháp`}
      description="Chỉ bản nháp của dự án mới gửi duyệt cả bộ được. Hãy chọn lại trên trang dự án."
      action={backTo(projectId)}
    />
  );
}

export function SetLoadError({
  message,
  onRetry,
  retrying,
  projectId,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
  projectId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div role="alert">
        <Alert tone="danger" title="Chưa tải được dự án.">
          {message}
        </Alert>
      </div>
      <div className="flex flex-wrap gap-3">
        <RetryButton onRetry={onRetry} retrying={retrying} />
        {backTo(projectId)}
      </div>
    </div>
  );
}
