"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import { CUSTOMER_REASON_OPTIONS, requestReason } from "../labels";
import type { HoldReason } from "../types";
import { CANCELLATION_NOTE_MAX, cancellationFormSchema } from "../schemas";

export type CancellationFormValues = z.output<typeof cancellationFormSchema>;

const COPY = {
  // The BE cancels at once before release to production or the warehouse (kltn-docs 17 §4.5)…
  cancel: {
    title: "Huỷ đơn hàng?",
    description:
      "Đơn hàng sẽ bị huỷ và không thể khôi phục. Nếu bạn đã thanh toán, vui lòng liên hệ CSKH để được hỗ trợ.",
    confirm: "Xác nhận huỷ",
    pending: "Đang huỷ...",
  },
  // …and after that Sales decide (kltn-docs 17 §2, §4.4); the explanation depends on the order (requestReason).
  request: {
    title: "Gửi yêu cầu huỷ đơn",
    confirm: "Gửi yêu cầu huỷ",
    pending: "Đang gửi...",
  },
} as const;

interface CancellationDialogProps {
  mode: "cancel" | "request" | null;
  /** The order's status and BE hold reason, to explain why Sales decide. */
  orderStatus: string;
  holdReason: HoldReason | null | undefined;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Why the last attempt failed, kept in the dialog so the customer can fix it and retry. */
  error: string | undefined;
  onSubmit: (values: CancellationFormValues) => void;
}

/** Reason + note for a cancellation, whether the BE will cancel at once or open a request. */
export function CancellationDialog({
  mode,
  orderStatus,
  holdReason,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: CancellationDialogProps) {
  const copy = COPY[mode ?? "cancel"];
  const description =
    mode === "request" ? requestReason(orderStatus, holdReason).dialog : COPY.cancel.description;
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CancellationFormValues>({
    resolver: zodResolver(cancellationFormSchema),
    defaultValues: { reasonCode: "CUSTOMER_REQUEST", note: "" },
  });
  const reasonCode = useWatch({ control, name: "reasonCode" });

  useEffect(() => {
    if (mode) reset({ reasonCode: "CUSTOMER_REQUEST", note: "" });
  }, [mode, reset]);

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <Controller
            control={control}
            name="reasonCode"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                aria-label="Lý do huỷ"
                className="gap-1"
              >
                {CUSTOMER_REASON_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`cancel-reason-${option.value}`}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-normal"
                  >
                    <RadioGroupItem id={`cancel-reason-${option.value}`} value={option.value} />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            )}
          />

          <div className="space-y-1.5">
            <Label htmlFor="cancel-note" className="text-sm font-medium">
              Ghi chú{reasonCode === "OTHER" ? " (bắt buộc)" : " (không bắt buộc)"}
            </Label>
            <Textarea
              id="cancel-note"
              rows={3}
              maxLength={CANCELLATION_NOTE_MAX}
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={errors.note ? "cancel-note-error" : undefined}
              {...register("note")}
            />
            {errors.note ? (
              <p id="cancel-note-error" role="alert" className="text-danger text-sm">
                {errors.note.message}
              </p>
            ) : null}
          </div>

          {error ? (
            <div role="alert">
              <Alert tone="danger" title="Không thực hiện được.">
                {error}
              </Alert>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => onOpenChange(false)}
            >
              Quay lại
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="bg-danger hover:bg-danger/90 min-h-11 rounded-[var(--r-md)] px-4 text-white"
            >
              {pending ? copy.pending : copy.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
