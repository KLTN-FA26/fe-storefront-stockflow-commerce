"use client";

import { useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { previewAcceptance, type QuotePreview } from "@/lib/domain/quote-pricing";
import { formatNumber } from "@/lib/format/number";
import { cn } from "@/lib/cn";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { QuoteCardLine } from "../../card-payloads";
import { QUOTE_FEEDBACK_MAX, requestChangesInputSchema } from "../../schemas";
import type { QuotePricing } from "../../types";
import { CardDialog } from "./card-dialog";
import { cardMoney } from "./card-frame";

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
  /** MOQ, tiers, tax and fees from `GET /quotes/{id}`; undefined while loading or when it failed. */
  pricing: QuotePricing | undefined;
  pricingFailed: boolean;
  currency?: string | null | undefined;
  onAccept: (cartons: Record<string, number>) => void;
}

const cartonsOf = (lines: readonly QuoteCardLine[], values: AcceptForm["lines"] | undefined) =>
  Object.fromEntries(lines.map((line, i) => [line.id, values?.[i]?.cartons ?? Number.NaN]));

/**
 * ACCEPT: cartons per line, the proposal by default (16 §4.3 step 7, plan B.2 C10), with the same live MOQ, tier
 * price, line total and total with tax as the quote page (F-03.1: below the MOQ is refused here first; the BE
 * refuses it too). The figures are a preview: the BE's are the official ones.
 */
export function AcceptQuoteDialog({
  open,
  onOpenChange,
  lines,
  pending,
  error,
  badLine,
  pricing,
  pricingFailed,
  currency,
  onAccept,
}: AcceptDialogProps) {
  const defaults = { lines: lines.map((line) => ({ cartons: line.cartons ?? 1 })) };
  const { control, register, handleSubmit, reset, setError, formState } = useForm<AcceptForm>({
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

  const preview: QuotePreview | null = pricing
    ? previewAcceptance(pricing, cartonsOf(lines, chosen))
    : null;
  const previewOf = (lineId: string) => preview?.lines.find((entry) => entry.lineId === lineId);

  const submit = handleSubmit((values) => {
    if (pricing) {
      const checked = previewAcceptance(pricing, cartonsOf(lines, values.lines));
      let belowMoq = false;
      lines.forEach((line, i) => {
        const entry = checked.lines.find((candidate) => candidate.lineId === line.id);
        if (!entry?.belowMoq || entry.moq == null) return;
        belowMoq = true;
        setError(`lines.${i}.cartons`, {
          type: "moq",
          message: `Dòng ${line.lineNo}: tối thiểu ${formatNumber(entry.moq)} thùng (MOQ).`,
        });
      });
      if (belowMoq) return;
    }
    onAccept(Object.fromEntries(lines.map((line, i) => [line.id, values.lines[i]?.cartons ?? 1])));
  });
  const money = (amount: number | null | undefined) =>
    amount == null ? "—" : cardMoney(amount, currency);

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
        const linePreview = previewOf(line.id);
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
            {linePreview ? (
              <dl className="text-ink-secondary grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm tabular-nums">
                <dt>MOQ</dt>
                <dd className="text-ink-primary text-right">
                  {linePreview.moq == null ? "—" : `${formatNumber(linePreview.moq)} thùng`}
                </dd>
                <dt>Đơn giá / cái</dt>
                <dd className="text-ink-primary text-right">{money(linePreview.unitPrice)}</dd>
                <dt>Thành tiền</dt>
                <dd className="text-ink-primary text-right font-medium">
                  {money(linePreview.lineTotal)}
                </dd>
              </dl>
            ) : null}
            {fieldError ? (
              <p id={`${id}-error`} role="alert" className="text-danger text-sm">
                {fieldError}
              </p>
            ) : null}
          </div>
        );
      })}
      {preview ? (
        <dl className="border-border-default space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-secondary">Tiền hàng</dt>
            <dd className="text-ink-primary tabular-nums">{money(preview.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-secondary">Phí</dt>
            <dd className="text-ink-primary tabular-nums">{money(preview.fees)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-secondary">Thuế VAT</dt>
            <dd className="text-ink-primary tabular-nums">{money(preview.tax)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-primary font-semibold">Tổng có thuế (tạm tính)</dt>
            <dd className="text-ink-primary font-semibold tabular-nums">{money(preview.total)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-ink-tertiary text-sm" role={pricingFailed ? "status" : undefined}>
          {pricingFailed
            ? "Chưa tải được MOQ và giá tạm tính. Hệ thống vẫn kiểm MOQ khi bạn chấp nhận."
            : "Đang tải MOQ và giá tạm tính…"}
        </p>
      )}
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
