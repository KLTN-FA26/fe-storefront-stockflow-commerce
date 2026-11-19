"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Alert, ConfirmDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format/money";

import { belowMoqLineNo, describeQuoteError, lineFieldErrors } from "../errors";
import { quoteAcceptanceFormSchema } from "../schemas";
import { moqOf, previewAcceptance } from "../selectors";
import type { Quote } from "../types";
import { QuoteAcceptLine } from "./quote-accept-line";
import { QUOTE_CARD } from "./quote-lines";

type FormValues = z.output<ReturnType<typeof quoteAcceptanceFormSchema>>;

interface QuoteAcceptFormProps {
  quote: Quote;
  pending: boolean;
  /** The last refusal of the acceptance, shown here: the BE's message, its line marked. */
  error: unknown;
  onAccept: (lines: FormValues["lines"]) => void;
  onRequestChanges: () => void;
}

const money = (amount: number | null) => (amount == null ? "—" : formatMoney(amount));

/**
 * Accepting a SENT quote (14 §4.1 step 4, plan D2): cartons per line, proposed by default; live
 * pieces, MOQ, tier, line total and total with tax as a preview only — the BE's numbers are the
 * official ones. Below the MOQ is refused here first (F-03.1); the BE refuses it too, and its
 * QUOTE_BELOW_MOQ marks line `details.lineNo`.
 */
export function QuoteAcceptForm({
  quote,
  pending,
  error,
  onAccept,
  onRequestChanges,
}: QuoteAcceptFormProps) {
  const [confirming, setConfirming] = useState<FormValues["lines"] | null>(null);
  const schema = useMemo(
    () =>
      quoteAcceptanceFormSchema(
        quote.lines.map((line) => ({
          lineId: line.id,
          lineNo: line.lineNo,
          sku: line.sku,
          moq: moqOf(line),
        })),
      ),
    [quote.lines],
  );
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      lines: quote.lines.map((line) => ({ lineId: line.id, cartons: line.cartons ?? 1 })),
    },
  });
  const values = useWatch({ control, name: "lines" });
  const preview = previewAcceptance(
    quote,
    Object.fromEntries((values ?? []).map((entry) => [entry.lineId, entry.cartons])),
  );
  const refusedLineNo = belowMoqLineNo(error);
  const beFieldErrors = lineFieldErrors(error);

  return (
    <section className={`${QUOTE_CARD} space-y-4`} aria-labelledby="quote-accept-heading">
      <div>
        <h2
          id="quote-accept-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Chấp nhận báo giá
        </h2>
        <p className="text-ink-secondary mt-1 text-sm">
          Chọn số thùng cho từng dòng (mặc định theo đề xuất của Sale). Bậc giá áp dụng theo tổng số
          thùng của mỗi SKU.
        </p>
      </div>
      <form onSubmit={handleSubmit((form) => setConfirming(form.lines))} noValidate>
        <ul className="space-y-3" aria-label="Số thùng từng dòng">
          {quote.lines.map((line, index) => (
            <QuoteAcceptLine
              key={line.id}
              line={line}
              preview={preview.lines[index]!}
              field={register(`lines.${index}.cartons`, { valueAsNumber: true })}
              error={errors.lines?.[index]?.cartons?.message ?? beFieldErrors.get(index)}
              refused={refusedLineNo === line.lineNo}
            />
          ))}
        </ul>
        <dl className="border-border-default mt-4 space-y-1.5 border-t pt-3 text-sm">
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
            <dd className="font-display text-ink-primary text-lg font-bold tabular-nums">
              {money(preview.total)}
            </dd>
          </div>
        </dl>
        <p className="text-ink-tertiary mt-2 text-xs">
          Số tiền chính thức là số trên báo giá sau khi bạn chấp nhận.
        </p>
        {error ? (
          <div role="alert" className="mt-3">
            <Alert tone="danger" title="Chưa chấp nhận được báo giá.">
              {describeQuoteError(error)}
            </Alert>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={pending}
            onClick={onRequestChanges}
          >
            Yêu cầu sửa
          </Button>
          <Button type="submit" className="min-h-11 rounded-[var(--r-md)] px-5" disabled={pending}>
            {pending ? "Đang gửi..." : "Chấp nhận báo giá"}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Chấp nhận báo giá ${quote.quoteNumber}?`}
        description={`Tổng có thuế tạm tính ${money(preview.total)}. Sau khi bạn chấp nhận, Sale sẽ lập đơn và gửi hợp đồng để ký.`}
        confirmLabel="Chấp nhận"
        variant="default"
        onConfirm={() => {
          if (confirming) onAccept(confirming);
        }}
      />
    </section>
  );
}
