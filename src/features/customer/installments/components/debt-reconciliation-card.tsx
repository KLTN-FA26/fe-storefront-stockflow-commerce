"use client";

import { useState } from "react";

import { DatePicker } from "@/components/shared/DatePicker";
import { DocumentDownloadButton } from "@/components/storefront/document-download-button";
import { getMyDebtReconciliation } from "@/lib/documents";
import { vnDayOf } from "@/lib/format/date";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

/**
 * The period a reconciliation covers by default: from the first day of this year to today, in
 * Vietnam. Debts are reconciled at least at year end (the closing balance the audit asks for);
 * the customer narrows it to a month or a quarter with the pickers.
 */
export function defaultReconciliationPeriod(now: Date = new Date()): { from: string; to: string } {
  const to = vnDayOf(now);
  return { from: `${to.slice(0, 4)}-01-01`, to };
}

/** Why the chosen period cannot be asked for, mirroring the BE's 400; null when it can. */
export function reconciliationPeriodError(from: string, to: string, today: string): string | null {
  if (!from || !to) return "Hãy chọn đủ ngày bắt đầu và ngày kết thúc.";
  if (to > today) return "Ngày kết thúc không được sau hôm nay.";
  if (from > to) return "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.";
  return null;
}

/**
 * "Biên bản đối chiếu công nợ" (documents/endpoints.md 6c): the customer's own books over a period
 * they choose, as the PDF both companies sign. The BE takes no customer id here, so it can only ever
 * read the caller's.
 */
export function DebtReconciliationCard() {
  const today = vnDayOf(new Date());
  const [period, setPeriod] = useState(() => defaultReconciliationPeriod());
  const problem = reconciliationPeriodError(period.from, period.to, today);

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="debt-reconciliation-heading">
      <div>
        <h2
          id="debt-reconciliation-heading"
          className="font-display text-ink-primary text-base font-semibold"
        >
          Biên bản đối chiếu công nợ
        </h2>
        <p className="text-ink-secondary text-sm">
          Số phải trả, đã trả và còn nợ theo hợp đồng trong kỳ bạn chọn, để hai bên ký xác nhận.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="reconciliation-from" className="text-ink-secondary text-sm">
            Từ ngày
          </label>
          <DatePicker
            id="reconciliation-from"
            value={period.from}
            max={period.to || today}
            onChange={(from) => setPeriod((current) => ({ ...current, from }))}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="reconciliation-to" className="text-ink-secondary text-sm">
            Đến ngày
          </label>
          <DatePicker
            id="reconciliation-to"
            value={period.to}
            min={period.from || undefined}
            max={today}
            onChange={(to) => setPeriod((current) => ({ ...current, to }))}
          />
        </div>
      </div>
      {problem ? (
        <p role="alert" className="text-danger-ink text-sm">
          {problem}
        </p>
      ) : (
        <DocumentDownloadButton
          kind="debtReconciliation"
          className="w-full sm:w-auto"
          label="Tải biên bản đối chiếu"
          load={() => getMyDebtReconciliation(period.from, period.to)}
        />
      )}
    </section>
  );
}
