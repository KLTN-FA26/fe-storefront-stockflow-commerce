"use client";

import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/cn";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { QuoteCardLine } from "../../card-payloads";
import { QUOTE_FEEDBACK_MAX, requestChangesInputSchema } from "../../schemas";
import { CardDialog } from "./card-dialog";

const acceptFormSchema = z.object({
  lines: z.array(
    z.object({
      cartons: z
        .number({ error: "Vui lòng nhập số thùng." })
        .int("Số thùng phải là số nguyên.")
        .min(1, "Số thùng tối thiểu là 1."),
    }),
  ),
});
type AcceptForm = z.infer<typeof acceptFormSchema>;

interface AcceptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lines priced by the carton: those whose cartons the customer chooses. */
  lines: QuoteCardLine[];
  pending: boolean;
  error: string | null;
  /** `lineNo` the BE refused (QUOTE_BELOW_MOQ `details.lineNo`). */
  badLine: number | null;
  onAccept: (cartons: Record<string, number>) => void;
}

/** ACCEPT: cartons per line, the proposal by default (16 §4.3 step 7, plan B.2 C10). */
export function AcceptQuoteDialog({
  open,
  onOpenChange,
  lines,
  pending,
  error,
  badLine,
  onAccept,
}: AcceptDialogProps) {
  const defaults = { lines: lines.map((line) => ({ cartons: line.cartons ?? 1 })) };
  const { control, register, handleSubmit, reset, formState } = useForm<AcceptForm>({
    resolver: zodResolver(acceptFormSchema),
    defaultValues: defaults,
  });
  const chosen = useWatch({ control, name: "lines" });
  // Start from the proposal each time the dialog opens, not on every render: the thread polls,
  // and a refreshed card brings new `lines` that would wipe what the customer is typing.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset({ lines: lines.map((line) => ({ cartons: line.cartons ?? 1 })) });
    }
    wasOpen.current = open;
  }, [open, lines, reset]);

  const submit = handleSubmit((values) =>
    onAccept(Object.fromEntries(lines.map((line, i) => [line.id, values.lines[i]?.cartons ?? 1]))),
  );

  return (
    <CardDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Chấp nhận báo giá"
      description="Kiểm tra số thùng từng dòng. Số thùng phải đạt số lượng đặt tối thiểu (MOQ) của sản phẩm; đơn giá theo bậc số lượng do hệ thống tính lại."
      confirm="Chấp nhận báo giá"
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      {lines.map((line, i) => {
        const fieldError = formState.errors.lines?.[i]?.cartons?.message;
        const refused = badLine === line.lineNo;
        const cartons = chosen?.[i]?.cartons;
        const units =
          line.unitsPerCarton && Number.isFinite(cartons)
            ? (cartons ?? 0) * line.unitsPerCarton
            : null;
        const id = `accept-line-${line.id}`;
        return (
          <div
            key={line.id}
            data-refused={refused || undefined}
            className={cn(
              "space-y-1.5 rounded-[var(--r-md)] border p-3",
              refused ? "border-danger bg-danger/5" : "border-border-default",
            )}
          >
            <Label htmlFor={id} className="text-sm font-medium">
              Dòng {line.lineNo} · <span className="font-mono">{line.sku}</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                className="min-h-11 w-28 tabular-nums"
                aria-invalid={fieldError || refused ? true : undefined}
                aria-describedby={fieldError ? `${id}-error` : undefined}
                {...register(`lines.${i}.cartons`, { valueAsNumber: true })}
              />
              <span className="text-ink-secondary text-sm tabular-nums">
                thùng{units !== null ? ` = ${formatNumber(units)} cái` : ""}
              </span>
            </div>
            {fieldError ? (
              <p id={`${id}-error`} role="alert" className="text-danger text-sm">
                {fieldError}
              </p>
            ) : null}
          </div>
        );
      })}
    </CardDialog>
  );
}

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
