import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import { batchWindow, installmentDue } from "../contract-labels";
import type { ContractBatch, ContractInstallment } from "../contract-schemas";

/** Lịch giao: each batch's window, SKU × cartons = pieces, and its value (14 §4.3 step 11). */
export function ContractDeliverySchedule({ batches }: { batches: readonly ContractBatch[] }) {
  if (batches.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-ink-primary text-sm font-semibold">Lịch giao</h3>
      <ol className="space-y-2" aria-label="Lịch giao">
        {batches.map((batch) => (
          <li
            key={batch.seq}
            className="border-border-default rounded-[var(--r-md)] border p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-ink-primary font-medium">
                Đợt {batch.seq}
                <span className="text-ink-secondary font-normal tabular-nums">
                  {" "}
                  · {batchWindow(batch)}
                </span>
              </p>
              <p className="text-ink-primary font-semibold tabular-nums">
                {formatMoney(batch.value)}
              </p>
            </div>
            <ul className="mt-1 space-y-0.5">
              {batch.lines.map((line) => (
                <li key={line.orderLineId} className="text-ink-secondary tabular-nums">
                  <span className="text-ink-primary font-mono break-all">{line.sku ?? "—"}</span> ×{" "}
                  {formatNumber(line.cartons)} thùng = {formatNumber(line.units)} cái
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Lịch thanh toán: name, when it is due, its share and amount (14 §4.3 step 12). */
export function ContractPaymentPlan({ plan }: { plan: readonly ContractInstallment[] }) {
  if (plan.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-ink-primary text-sm font-semibold">Lịch thanh toán</h3>
      <ol className="divide-border-default divide-y text-sm" aria-label="Lịch thanh toán">
        {plan.map((installment) => (
          <li key={installment.seq} className="flex items-start justify-between gap-4 py-2">
            <div className="min-w-0">
              <p className="text-ink-primary font-medium">
                Đợt {installment.seq} · {installment.name}
              </p>
              <p className="text-ink-secondary">{installmentDue(installment)}</p>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <p className="text-ink-primary font-semibold">{formatMoney(installment.amount)}</p>
              {installment.percent != null ? (
                <p className="text-ink-tertiary text-xs">{formatNumber(installment.percent)}%</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
