"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { QUOTE_FEEDBACK_MAX, requestChangesInputSchema } from "../../schemas";
import { CardDialog } from "./card-dialog";

const changesFormSchema = requestChangesInputSchema.pick({ note: true });
type ChangesForm = z.infer<typeof changesFormSchema>;

interface ChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  onRequest: (note: string) => void;
}

/** REQUEST_CHANGES: what Sales should change, required. */
export function RequestChangesDialog({
  open,
  onOpenChange,
  pending,
  error,
  onRequest,
}: ChangesDialogProps) {
  const { register, handleSubmit, reset, formState } = useForm<ChangesForm>({
    resolver: zodResolver(changesFormSchema),
    defaultValues: { note: "" },
  });
  useEffect(() => {
    if (open) reset({ note: "" });
  }, [open, reset]);
  const noteError = formState.errors.note?.message;

  return (
    <CardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Yêu cầu sửa báo giá"
      description="Sale sẽ lập bản sửa theo góp ý của bạn và gửi lại trong cuộc trò chuyện này."
      confirm="Gửi yêu cầu sửa"
      pending={pending}
      error={error}
      onSubmit={handleSubmit((values) => onRequest(values.note))}
    >
      <div className="space-y-1.5">
        <Label htmlFor="quote-change-note" className="text-sm font-medium">
          Nội dung cần sửa (bắt buộc)
        </Label>
        <Textarea
          id="quote-change-note"
          rows={4}
          maxLength={QUOTE_FEEDBACK_MAX}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? "quote-change-note-error" : undefined}
          {...register("note")}
        />
        {noteError ? (
          <p id="quote-change-note-error" role="alert" className="text-danger text-sm">
            {noteError}
          </p>
        ) : null}
      </div>
    </CardDialog>
  );
}
