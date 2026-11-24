"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
import type { z } from "zod";

import { cn } from "@/lib/cn";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { CHAT_COMMENT_MAX, rateInputSchema } from "../schemas";

type RateForm = z.input<typeof rateInputSchema>;

interface CsatFormProps {
  /** Distinguishes the form's ids when two are on screen. */
  idPrefix: string;
  pending: boolean;
  error: string | null;
  onRate: (values: { score: number; comment?: string | undefined }) => void;
}

/** 1–5 stars and an optional comment (C11, or a CSAT_SURVEY card's RATE). */
export function CsatForm({ idPrefix, pending, error, onRate }: CsatFormProps) {
  const { control, register, handleSubmit, formState } = useForm<RateForm>({
    resolver: zodResolver(rateInputSchema),
    defaultValues: { score: 0, comment: "" },
  });
  const submit = handleSubmit((values) => {
    const comment = values.comment?.trim();
    onRate({ score: values.score, ...(comment ? { comment } : {}) });
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <Controller
        control={control}
        name="score"
        render={({ field }) => (
          <div role="radiogroup" aria-label="Số sao đánh giá" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                role="radio"
                aria-checked={field.value === score}
                aria-label={`${score} sao`}
                onClick={() => field.onChange(score)}
                className="hover:bg-bg-subtle focus-visible:ring-accent flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
              >
                <Star
                  aria-hidden
                  className={cn(
                    "size-6",
                    score <= field.value ? "fill-warning text-warning" : "text-ink-tertiary",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      />
      {formState.errors.score ? (
        <p role="alert" className="text-danger text-sm">
          {formState.errors.score.message}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-comment`} className="text-sm font-medium">
          Nhận xét (không bắt buộc)
        </Label>
        <Textarea
          id={`${idPrefix}-comment`}
          rows={2}
          maxLength={CHAT_COMMENT_MAX}
          {...register("comment")}
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 rounded-[var(--r-md)] px-4">
        {pending ? "Đang gửi..." : "Gửi đánh giá"}
      </Button>
    </form>
  );
}
