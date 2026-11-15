"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { describeDesignError } from "../errors";
import { invalidateDesign } from "../mutations";
import { returnReasonInputSchema } from "../schemas";
import { MOCK_ROUNDS_KEY, simulateApprove, simulateReturn } from "../simulation";
import type { ReturnReasonInput } from "../types";

/**
 * Duyệt / Trả lại for one design waiting for review (docs 12 BR-06: a return needs a reason).
 * `name` goes into the accessible names when several designs are listed together.
 */
export function ReviewActions({ designId, name }: { designId: string; name?: string }) {
  const client = useQueryClient();
  const form = useForm<ReturnReasonInput>({
    resolver: zodResolver(returnReasonInputSchema),
    defaultValues: { reason: "" },
  });
  // The design's own queries, its project's (banner, cards, openRound) and the panel's open rounds.
  const settled = () =>
    Promise.all([
      invalidateDesign(client, designId),
      client.invalidateQueries({ queryKey: MOCK_ROUNDS_KEY }),
    ]);
  const approve = useMutation({
    mutationFn: () => simulateApprove(designId),
    onSettled: settled,
  });
  const giveBack = useMutation({
    mutationFn: (input: ReturnReasonInput) => simulateReturn(designId, input),
    onSuccess: () => form.reset(),
    onSettled: settled,
  });
  const pending = approve.isPending || giveBack.isPending;
  const error = approve.error ?? giveBack.error;
  const named = (label: string) => (name ? `${label}: ${name}` : label);
  const reasonError = form.formState.errors.reason;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((input) => giveBack.mutate(input))}
      className="flex flex-col gap-2"
    >
      <Textarea
        aria-label={named("Lý do trả lại")}
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
          aria-label={named("Duyệt")}
          onClick={() => approve.mutate()}
        >
          Duyệt
        </Button>
        <Button
          type="submit"
          variant="outline"
          aria-label={named("Trả lại")}
          className="min-h-11 flex-1"
          disabled={pending}
        >
          Trả lại
        </Button>
      </div>
    </form>
  );
}
