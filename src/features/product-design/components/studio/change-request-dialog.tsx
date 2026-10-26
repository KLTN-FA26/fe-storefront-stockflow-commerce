"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

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

import { describeDesignError } from "../../errors";
import { useRequestChanges, useWithdrawConfirmation } from "../../mutations";
import { changeReasonInputSchema } from "../../schemas";
import type { ChangeReasonInput } from "../../types";
import { useWorkflow } from "./workflow-context";

/** `requestChanges`: "Yêu cầu sửa" what Sales sent; `withdraw`: "Rút lại" the request to edit it. */
export type ChangeRequestKind = "requestChanges" | "withdraw";

const COPY: Record<
  ChangeRequestKind,
  { title: string; description: string; label: string; submit: string; pending: string }
> = {
  requestChanges: {
    title: "Yêu cầu sửa thiết kế",
    description:
      "Thiết kế sẽ trở lại để chỉnh sửa. Lý do của bạn được gửi cho Sales và hiện trong ghi chú kiểm tra.",
    label: "Lý do yêu cầu sửa",
    submit: "Gửi yêu cầu sửa",
    pending: "Đang gửi…",
  },
  withdraw: {
    title: "Rút lại yêu cầu xác nhận?",
    description:
      "Thiết kế sẽ trở lại trạng thái đang thiết kế để bạn chỉnh sửa. Sau khi sửa, thiết kế cần được kiểm tra và gửi xác nhận lại.",
    label: "Lý do rút yêu cầu",
    submit: "Rút yêu cầu",
    pending: "Đang rút…",
  },
};

const REASON_MAX = 2000;

function ChangeRequestForm({ kind, onClose }: { kind: ChangeRequestKind; onClose: () => void }) {
  const { design } = useWorkflow();
  const requestChanges = useRequestChanges(design.id);
  const withdraw = useWithdrawConfirmation(design.id);
  const mutation = kind === "withdraw" ? withdraw : requestChanges;
  const copy = COPY[kind];
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangeReasonInput>({
    resolver: zodResolver(changeReasonInputSchema),
    defaultValues: { reason: "" },
  });

  const onSubmit = ({ reason }: ChangeReasonInput) =>
    mutation.mutate({ version: design.version, reason }, { onSuccess: onClose });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="change-reason" className="text-sm font-medium">
          {copy.label}
        </Label>
        <Textarea
          id="change-reason"
          rows={3}
          maxLength={REASON_MAX}
          autoFocus
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? "change-reason-error" : undefined}
          {...register("reason")}
        />
        {errors.reason ? (
          <p id="change-reason-error" role="alert" className="text-danger text-sm">
            {errors.reason.message}
          </p>
        ) : null}
      </div>
      {mutation.error ? (
        <div role="alert">
          <Alert tone="danger" title="Chưa gửi được.">
            {describeDesignError(mutation.error)}
          </Alert>
        </div>
      ) : null}
      <DialogFooter className="border-border-default bg-bg-subtle">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={onClose}
        >
          Quay lại
        </Button>
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="min-h-11 rounded-[var(--r-md)] px-4"
        >
          {mutation.isPending ? copy.pending : copy.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * The reason a design Sales sent goes back to editing: "Yêu cầu sửa" (the reason becomes the
 * design's notes) or "Rút lại" (the customer withdraws to edit it). Validated with the BE's rule
 * (`changeReasonInputSchema`: not blank, at most 2000 characters).
 */
export function ChangeRequestDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: ChangeRequestKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
      >
        <ChangeRequestForm key={kind} kind={kind} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
