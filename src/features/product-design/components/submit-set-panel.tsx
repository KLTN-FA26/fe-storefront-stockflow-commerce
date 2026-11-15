"use client";

import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import { describeStop, type SetState } from "./submit-set-state";

const BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

type Message = {
  tone: "info" | "danger";
  title: string;
  body: ReactNode;
  /** An error is an alert; good news a status. */
  role: "alert" | "status";
};
/** The button that moves the run on, or says what it is doing (`busy`) in the same place. */
type Primary = { label: string; busy?: true; onClick?: () => void };
type View = {
  message: Message | null;
  secondary: "cancel" | "back" | null;
  primary: Primary | null;
};

type Handlers = { onConfirm: () => void; onRetry: () => void; onRecheck: () => void };

function viewOf(state: SetState, count: number, on: Handlers): View {
  switch (state.phase) {
    case "checking":
      return {
        message: null,
        secondary: "cancel",
        primary: { label: "Đang kiểm tra…", busy: true },
      };
    case "failed": {
      const failed = Object.values(state.rows).filter((row) => row.kind === "failed").length;
      return {
        message: {
          tone: "danger",
          role: "alert",
          title: "Chưa gửi bản nào.",
          body: `${failed} bản chưa đạt kiểm tra. Hãy sửa trong studio rồi kiểm tra lại.`,
        },
        secondary: "back",
        primary: { label: "Kiểm tra lại", onClick: on.onRecheck },
      };
    }
    case "confirm":
      return {
        message: {
          tone: "info",
          role: "status",
          title: `${count} bản đều đạt`,
          body: (
            <span className="flex items-start gap-2">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
              Các bản được gửi duyệt cùng lúc và bị khoá đến khi có kết quả duyệt.
            </span>
          ),
        },
        secondary: "cancel",
        primary: { label: `Gửi duyệt ${count} bản`, onClick: on.onConfirm },
      };
    case "sending":
      return {
        message: null,
        secondary: "cancel",
        primary: { label: "Đang dựng và tải lên…", busy: true },
      };
    case "opening":
      return {
        message: null,
        secondary: null,
        primary: { label: "Đang mở lượt duyệt…", busy: true },
      };
    case "stalled":
      return {
        message: state.roundUnknown
          ? {
              tone: "danger",
              role: "alert",
              title: "Chưa rõ lượt duyệt đã mở chưa.",
              body: "Không đọc được kết quả từ máy chủ. Bấm Thử lại để kiểm tra.",
            }
          : {
              tone: "danger",
              role: "alert",
              title: "Chưa gửi bản nào.",
              body: describeStop(state.error),
            },
        // Leaving while the round may be open would mislead: the project page tells the truth.
        secondary: state.canRetry && !state.roundUnknown ? "cancel" : "back",
        primary: state.canRetry ? { label: "Thử lại", onClick: on.onRetry } : null,
      };
    case "done":
      return {
        message: {
          tone: "info",
          role: "status",
          title: `Đã gửi duyệt ${count} bản.`,
          body: "Đang về trang dự án…",
        },
        secondary: null,
        primary: null,
      };
  }
}

type PanelProps = Handlers & {
  state: SetState;
  count: number;
  /** The project page. */
  back: string;
  onCancel: () => void;
};

/**
 * What the customer can do at each point: cancel ("Huỷ", until the round is being opened),
 * confirm the set once every design passed, check again after a Fail, try again after a stop.
 * The main button keeps its place while the run works (it says what it is doing, `aria-disabled`
 * so it keeps the focus), and each stop takes the focus to what stopped it (WCAG 2.4.3).
 */
export function SetPanel({ state, count, back, onCancel, ...on }: PanelProps) {
  const messageRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const { phase } = state;
  useEffect(() => {
    if (phase === "failed" || phase === "stalled") messageRef.current?.focus();
    else if (phase === "confirm") primaryRef.current?.focus();
  }, [phase]);

  const { message, secondary, primary } = viewOf(state, count, on);
  return (
    <section aria-label="Gửi duyệt" className="flex flex-col gap-4">
      {message ? (
        <div
          ref={messageRef}
          role={message.role}
          tabIndex={-1}
          className="focus-visible:ring-accent rounded-[var(--r-sm)] outline-none focus-visible:ring-2"
        >
          <Alert tone={message.tone} title={message.title}>
            {message.body}
          </Alert>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        {secondary === "cancel" ? (
          <Button type="button" variant="outline" className={BUTTON} onClick={onCancel}>
            Huỷ
          </Button>
        ) : secondary === "back" ? (
          <Button asChild variant="outline" className={BUTTON}>
            <Link href={back} replace>
              Về dự án
            </Link>
          </Button>
        ) : null}
        {primary ? (
          <Button
            key="primary"
            ref={primaryRef}
            type="button"
            aria-disabled={primary.busy}
            onClick={primary.busy ? undefined : primary.onClick}
            className={cn(BUTTON, primary.busy && "cursor-progress opacity-70")}
          >
            {primary.busy ? <Loader2 aria-hidden className="mr-1.5 size-4 animate-spin" /> : null}
            {primary.label}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
