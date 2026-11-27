"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

import { MIN_SET_SIZE, PROJECT_STAGES, type Gate, type ProjectStage } from "../project-rules";
import type { Design, ProjectQuoteRequest } from "../types";
import { answeringQuote } from "./quote-request-parts";

type Props = {
  stage: ProjectStage;
  /** The project's designs; the bar waits for them. */
  designs: readonly Design[];
  /** Creating a design in the project (`projectActions(...).createDesign`, the device included). */
  createGate: Gate;
  /** The project's request: the open one, else the latest (`currentQuoteRequest`). */
  quoteRequest: ProjectQuoteRequest | null;
  /** The customer may ask for a project quote here (permission, project open). */
  mayAskQuote: boolean;
  onAskQuote: () => void;
};

const ACTION = "min-h-11 rounded-[var(--r-md)] px-4";

/** What the current step asks of the customer: one sentence and at most one primary action. */
function CurrentStep({ stage, designs, createGate, quoteRequest, mayAskQuote, onAskQuote }: Props) {
  if (stage === "design") {
    const drafts = designs.filter((design) => design.status === "DRAFT").length;
    if (drafts >= MIN_SET_SIZE) {
      return (
        <p className="text-ink-secondary text-sm">
          Đánh dấu các bản nháp muốn gửi bên dưới, rồi bấm “Gửi duyệt cả bộ” ở cuối trang.
        </p>
      );
    }
    return (
      <p className="text-ink-secondary text-sm">
        {createGate.allowed
          ? `Tạo hoặc thêm bản thiết kế bằng các nút ở trên. Từ ${MIN_SET_SIZE} bản nháp, bạn gửi duyệt cả bộ.`
          : (createGate.reason ?? `Cần ít nhất ${MIN_SET_SIZE} bản nháp để gửi duyệt cả bộ.`)}
      </p>
    );
  }
  if (stage === "review") {
    // How many still wait, and since when, is the open round's banner below.
    return (
      <p className="text-ink-secondary text-sm">
        Shop đang duyệt các bản bạn đã gửi. Bạn sẽ nhận thông báo khi có kết quả, rồi yêu cầu báo
        giá cho các bản đã duyệt.
      </p>
    );
  }
  const quote = quoteRequest ? answeringQuote(quoteRequest) : null;
  if (quote) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-secondary text-sm">Sale đã gửi báo giá cho dự án.</p>
        <Button asChild className={ACTION}>
          <Link href={STORE_ROUTES.account.quotes.detail(quote.id)}>
            {quote.number ? `Xem báo giá ${quote.number}` : "Xem báo giá"}
            <ArrowRight aria-hidden className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    );
  }
  if (quoteRequest?.status === "OPEN") {
    return (
      <p className="text-ink-secondary text-sm">
        Đã gửi yêu cầu báo giá. Sale sẽ lập báo giá cho cả bộ và gửi cho bạn.
      </p>
    );
  }
  const approved = designs.filter((design) => design.status === "APPROVED").length;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ink-secondary text-sm">
        {formatNumber(approved)} bản đã duyệt.{" "}
        {mayAskQuote
          ? "Yêu cầu một báo giá cho cả bộ, với một ngày giao chung."
          : "Chat với Sale để nhận báo giá cho các bản đã duyệt."}
      </p>
      {mayAskQuote ? (
        <Button type="button" className={ACTION} onClick={onAskQuote}>
          Yêu cầu báo giá cả dự án
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The project's way to a quote as three steps, "1 Thiết kế → 2 Duyệt → 3 Báo giá" (UI/UX 27/11,
 * sf-12), with what the current step asks and its one primary action, instead of several locked
 * buttons each explained in small print. An open project only: a closed one is for reading.
 */
export function ProjectSteps(props: Props) {
  const current = PROJECT_STAGES.findIndex((step) => step.id === props.stage);
  return (
    <section
      aria-labelledby="project-steps-title"
      className="bg-bg-surface border-border-default grid gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <h2 id="project-steps-title" className="sr-only">
        Các bước của dự án
      </h2>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {PROJECT_STAGES.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "todo";
          return (
            <li
              key={step.id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2"
            >
              {index > 0 ? (
                <span aria-hidden className="bg-border-default h-px w-4 sm:w-8" />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                  state === "done" && "border-accent bg-accent text-ink-inverse",
                  state === "current" && "border-accent text-accent",
                  state === "todo" && "border-border-default text-ink-tertiary",
                )}
              >
                {state === "done" ? <Check className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  state === "current"
                    ? "text-ink-primary font-semibold"
                    : state === "done"
                      ? "text-ink-secondary"
                      : "text-ink-tertiary",
                )}
              >
                <span className="sr-only">
                  Bước {index + 1}
                  {state === "done" ? " (đã xong)" : ""}:{" "}
                </span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
      <CurrentStep {...props} />
    </section>
  );
}
