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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { describeCreditRequestError, useSubmitCreditRequest } from "../mutations";
import { creditRequestFormSchema } from "../schemas";

import type { CreditRequest, CreditRequestFormValues, CreditRequestInput } from "../schemas";

const DIALOG =
  "bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0";
const BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-danger-ink text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The form, mounted only while the dialog is open: each opening starts empty. */
function RequestForm({
  onDone,
  onClose,
}: {
  onDone: (created: CreditRequest) => void;
  onClose: () => void;
}) {
  const submit = useSubmitCreditRequest();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreditRequestFormValues, unknown, CreditRequestInput>({
    resolver: zodResolver(creditRequestFormSchema),
    defaultValues: { requestedLimit: "", requestedTermDays: "30", reason: "" },
  });
  const send = handleSubmit((input) => submit.mutate(input, { onSuccess: onDone }));
  const a11y = (id: string, error?: string) => ({
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  });

  return (
    <form onSubmit={send} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Đề nghị cấp hạn mức</DialogTitle>
        <DialogDescription>
          Sale sẽ xem xét rồi chuyển kế toán duyệt. Bạn nhận thông báo khi đề nghị có kết quả, và có
          thể tải giấy tờ bổ sung sau khi gửi.
        </DialogDescription>
      </DialogHeader>
      <Field id="credit-limit" label="Hạn mức muốn xin (₫)" error={errors.requestedLimit?.message}>
        <Input
          {...a11y("credit-limit", errors.requestedLimit?.message)}
          inputMode="numeric"
          className="min-h-11 tabular-nums"
          {...register("requestedLimit")}
        />
      </Field>
      <Field
        id="credit-term"
        label="Số ngày thanh toán sau khi giao"
        error={errors.requestedTermDays?.message}
      >
        <Input
          {...a11y("credit-term", errors.requestedTermDays?.message)}
          inputMode="numeric"
          className="min-h-11 tabular-nums"
          {...register("requestedTermDays")}
        />
      </Field>
      <Field id="credit-reason" label="Lý do (không bắt buộc)" error={errors.reason?.message}>
        <Textarea
          {...a11y("credit-reason", errors.reason?.message)}
          rows={3}
          {...register("reason")}
        />
      </Field>
      {submit.error ? (
        <div role="alert">
          <Alert tone="danger">{describeCreditRequestError(submit.error)}</Alert>
        </div>
      ) : null}
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className={BUTTON}
          disabled={submit.isPending}
          onClick={onClose}
        >
          Huỷ
        </Button>
        <Button type="submit" className={BUTTON} disabled={submit.isPending}>
          {submit.isPending ? "Đang gửi..." : "Gửi đề nghị"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreditRequestDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (created: CreditRequest) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG}>
        {open ? <RequestForm onDone={onDone} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
