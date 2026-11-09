"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { describeDesignError } from "../errors";
import { invalidateDesign } from "../mutations";
import { returnReasonInputSchema } from "../schemas";
import { simulateApprove, simulateReturn } from "../simulation";
import type { ReturnReasonInput } from "../types";

/** Duyệt / Trả lại for one design waiting for review (docs 12 BR-06: a return needs a reason). */
export function ReviewActions({ designId }: { designId: string }) {
  const client = useQueryClient();
  const form = useForm<ReturnReasonInput>({
    resolver: zodResolver(returnReasonInputSchema),
    defaultValues: { reason: "" },
  });
  const approve = useMutation({
    mutationFn: () => simulateApprove(designId),
    onSettled: () => invalidateDesign(client, designId),
  });
  const giveBack = useMutation({
    mutationFn: (input: ReturnReasonInput) => simulateReturn(designId, input),
    onSuccess: () => form.reset(),
    onSettled: () => invalidateDesign(client, designId),
  });
  const pending = approve.isPending || giveBack.isPending;
  const error = approve.error ?? giveBack.error;
  const reasonError = form.formState.errors.reason;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((input) => giveBack.mutate(input))}
      className="flex flex-col gap-2"
    >
      <Textarea
        aria-label="Lý do trả lại"
        placeholder="Lý do trả lại"
        aria-invalid={reasonError ? true : undefined}
        disabled={pending}
        {...form.register("reason")}
      />
      {reasonError ? (
        <p role="alert" className="text-danger text-xs">
          {reasonError.message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {describeDesignError(error)}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1"
          disabled={pending}
          onClick={() => approve.mutate()}
        >
          Duyệt
        </Button>
        <Button type="submit" variant="outline" className="min-h-11 flex-1" disabled={pending}>
          Trả lại
        </Button>
      </div>
    </form>
  );
}
