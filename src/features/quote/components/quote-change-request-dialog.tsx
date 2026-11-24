"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { QUOTE_FEEDBACK_MAX, quoteFeedbackFormSchema } from "../schemas";

type FeedbackValues = z.output<typeof quoteFeedbackFormSchema>;

interface QuoteChangeRequestDialogProps {
  open: boolean;
  quoteNumber: string;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Why the last attempt failed, kept in the dialog so the customer can retry. */
  error: string | undefined;
  onSubmit: (feedback: string) => void;
}

/** "Yêu cầu sửa" (14 §4.1 step 4): what to change, required, at most 2000 characters. */
export function QuoteChangeRequestDialog({
  open,
  quoteNumber,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: QuoteChangeRequestDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeedbackValues>({
    resolver: zodResolver(quoteFeedbackFormSchema),
    defaultValues: { feedback: "" },
  });

  useEffect(() => {
    if (open) reset({ feedback: "" });
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="border-border-default bg-bg-surface gap-0 rounded-[var(--r-xl)] border p-0 shadow-[var(--sh-lg)] ring-0 sm:max-w-md"
      >
        <form onSubmit={handleSubmit((form) => onSubmit(form.feedback))} noValidate>
          <DialogHeader className="border-border-default border-b px-4.5 py-4">
            <DialogTitle className="text-ink-primary font-[family-name:var(--font-display)] text-[1.05rem] leading-tight font-semibold">
              Yêu cầu sửa báo giá {quoteNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-4.5 py-4.5">
            <DialogDescription className="text-ink-secondary text-sm leading-relaxed">
              Ghi rõ bạn muốn sửa gì (số thùng, giá, ngày giao…). Sale sẽ gửi bản sửa mới; báo giá
              hiện tại không còn chấp nhận được.
            </DialogDescription>
            <div className="space-y-1.5">
              <Label htmlFor="quote-feedback" className="text-sm font-medium">
                Nội dung cần sửa (bắt buộc)
              </Label>
              <Textarea
                id="quote-feedback"
                rows={4}
                maxLength={QUOTE_FEEDBACK_MAX}
                aria-invalid={errors.feedback ? true : undefined}
                aria-describedby={errors.feedback ? "quote-feedback-error" : undefined}
                {...register("feedback")}
              />
              {errors.feedback ? (
                <p id="quote-feedback-error" role="alert" className="text-danger text-sm">
                  {errors.feedback.message}
                </p>
              ) : null}
            </div>
            {error ? (
              <div role="alert">
                <Alert tone="danger" title="Chưa gửi được yêu cầu.">
                  {error}
                </Alert>
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-border-default bg-bg-subtle mx-0 mb-0 rounded-b-[var(--r-xl)] border-t px-4.5 py-3.5">
            <Button
              type="button"
              variant="outline"
              className="border-border-strong bg-bg-surface text-ink-primary hover:bg-bg-subtle min-h-11 rounded-[var(--r-sm)] px-4"
              onClick={() => onOpenChange(false)}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-[var(--r-sm)] px-4"
            >
              {pending ? "Đang gửi..." : "Gửi yêu cầu sửa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
