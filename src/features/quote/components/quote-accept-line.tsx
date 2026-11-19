import type { UseFormRegisterReturn } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import type { LinePreview } from "../selectors";
import type { QuoteLine } from "../types";
import { QuoteTierList } from "./quote-tiers";

interface QuoteAcceptLineProps {
  line: QuoteLine;
  preview: LinePreview;
  field: UseFormRegisterReturn;
  /** The form's or the BE's message for this line (MOQ, field error). */
  error: string | undefined;
  /** The BE refused this line (QUOTE_BELOW_MOQ `details.lineNo`): marked even without a message. */
  refused: boolean;
}

/**
 * One line of the acceptance form: the cartons the customer takes (proposed by default), and live
 * "= N cái", MOQ, the tier that applies and the line total (cartons × pieces per carton × price).
 */
export function QuoteAcceptLine({ line, preview, field, error, refused }: QuoteAcceptLineProps) {
  const inputId = `quote-line-${line.id}`;
  const errorId = `${inputId}-error`;
  const invalid = Boolean(error) || refused;
  return (
    <li
      data-line-no={line.lineNo}
      data-refused={refused ? "true" : undefined}
      className={cn(
        "space-y-3 rounded-[var(--r-md)] border p-3",
        invalid ? "border-danger bg-danger/5" : "border-border-default",
      )}
    >
      <p className="text-ink-primary text-sm">
        <span className="text-ink-tertiary">Dòng {line.lineNo} · </span>
        <span className="font-mono font-semibold break-all">{line.sku}</span>
      </p>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="space-y-1">
          <label htmlFor={inputId} className="text-ink-secondary block text-xs">
            Số thùng
          </label>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={`${inputId}-moq${error ? ` ${errorId}` : ""}`}
            className="bg-bg-surface h-11 w-32 rounded-[var(--r-md)] text-base tabular-nums"
            {...field}
          />
        </div>
        <p className="text-ink-primary pb-2.5 text-sm tabular-nums">
          = {formatNumber(preview.units)} cái
        </p>
        <p id={`${inputId}-moq`} className="text-ink-secondary pb-2.5 text-sm tabular-nums">
          MOQ: {preview.moq == null ? "—" : `${formatNumber(preview.moq)} thùng`}
        </p>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
      <QuoteTierList tiers={line.tiers} applied={preview.tier} />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ink-tertiary text-xs">Đơn giá / cái</dt>
          <dd className="text-ink-primary font-medium tabular-nums">
            {preview.unitPrice == null ? "—" : formatMoney(preview.unitPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-tertiary text-xs">Thành tiền</dt>
          <dd className="text-ink-primary font-semibold tabular-nums">
            {preview.lineTotal == null ? "—" : formatMoney(preview.lineTotal)}
          </dd>
        </div>
      </dl>
    </li>
  );
}
