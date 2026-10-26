"use client";

import { Circle, CircleCheck, CircleX, Loader2 } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";

import {
  REVIEW_WORK_STEPS,
  type ReviewSubmission,
  type ReviewWorkStep,
} from "./use-review-submission";

const STEP_LABELS: Record<ReviewWorkStep, string> = {
  preview: "Lưu và tạo ảnh xem trước",
  print: "Tạo file in PDF",
  spec: "Tạo bảng thông số kỹ thuật",
  upload: "Tải các file lên",
  request: "Gửi yêu cầu kiểm tra cho QC",
};

/** Where each step of a review submission stands (done, under way, failed, to come), and a bar. */
export function ReviewSteps({ submission }: { submission: ReviewSubmission }) {
  const { step, failedStep, fraction } = submission;
  const at = REVIEW_WORK_STEPS.indexOf(
    step === "error" ? (failedStep ?? "preview") : (step as ReviewWorkStep),
  );
  const reached = step === "done" ? REVIEW_WORK_STEPS.length : at;
  const progress =
    step === "done" ? 100 : ((Math.max(at, 0) + fraction) / REVIEW_WORK_STEPS.length) * 100;
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {REVIEW_WORK_STEPS.map((item, i) => {
          const failed = step === "error" && i === at;
          const Icon = i < reached ? CircleCheck : failed ? CircleX : i === at ? Loader2 : Circle;
          return (
            <li
              key={item}
              aria-current={i === at && step !== "done" ? "step" : undefined}
              className={cn(
                "flex min-h-8 items-center gap-2 text-sm",
                i <= reached ? "text-ink-primary" : "text-ink-tertiary",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  i < reached && "text-positive",
                  failed && "text-danger",
                  i === at && !failed && "text-accent animate-spin",
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
        aria-label="Tiến độ gửi QC"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      />
    </div>
  );
}
