import { LineGoods } from "@/components/storefront/line-goods";
import { isUnsellable, UNSELLABLE_LINE_TAG } from "@/lib/domain/quote-purchasability";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";

import { moqOf, shownLine } from "../selectors";
import type { Quote, QuoteFee, QuoteLine } from "../types";
import { QuoteTierList, ratePercent } from "./quote-tiers";

export const QUOTE_CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

const money = (amount: number | null | undefined) => (amount == null ? "—" : formatMoney(amount));

export function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-tertiary text-xs">{label}</dt>
      <dd className="text-ink-primary text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** "60 thùng = 60.000 cái" (14 BR-08); a legacy line counts units only. */
export function cartonsText(cartons: number | null, units: number) {
  if (cartons == null) return `${formatNumber(units)} cái`;
  return `${formatNumber(cartons)} thùng = ${formatNumber(units)} cái`;
}

/** "Đã ngừng bán" next to a line whose SKU can no longer be bought (WF-02 FE-1, 01 BR-04). */
export function UnsellableTag() {
  return (
    <span className="border-danger/30 bg-danger/5 text-danger-ink inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      {UNSELLABLE_LINE_TAG}
    </span>
  );
}

function LineItem({ line, markUnsellable }: { line: QuoteLine; markUnsellable: boolean }) {
  const shown = shownLine(line);
  const moq = moqOf(line);
  return (
    <li className="space-y-3 py-3">
      <LineGoods
        prefix={`Dòng ${line.lineNo} · `}
        sku={line.sku}
        designName={line.designName}
        previewUrl={line.previewUrl}
        unitsPerCarton={line.unitsPerCarton}
      />
      {markUnsellable && isUnsellable(line.purchasability) ? <UnsellableTag /> : null}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Số lượng">{cartonsText(shown.cartons, shown.units)}</Fact>
        <Fact label="MOQ">{moq == null ? "—" : `${formatNumber(moq)} thùng`}</Fact>
        <Fact label="Đơn giá / cái">{money(shown.unitPrice)}</Fact>
        <Fact label="Thành tiền">{money(shown.lineTotal)}</Fact>
        <Fact label={`Thuế VAT${line.taxRate != null ? ` ${ratePercent(line.taxRate)}` : ""}`}>
          {money(shown.tax)}
        </Fact>
      </dl>
      <QuoteTierList tiers={line.tiers} applied={shown.tier} />
    </li>
  );
}

export const FEE_LABEL: Record<QuoteFee["kind"], string> = {
  PLATE_FEE: "Phí khuôn / bản in",
  SHIPPING_FEE: "Phí vận chuyển",
  UNKNOWN: "Phí khác",
};

/** Fee lines: plate fee of a SKU produced for the first time, shipping (14 BR-17, BR-20). */
export function QuoteFees({ fees }: { fees: readonly QuoteFee[] }) {
  if (fees.length === 0) return null;
  return (
    <div className="border-border-default border-t pt-3">
      <h3 className="text-ink-primary text-sm font-semibold">Phí</h3>
      <ul className="divide-border-default divide-y">
        {fees.map((fee) => (
          <li key={fee.id} className="flex items-start justify-between gap-4 py-2 text-sm">
            <div className="min-w-0">
              <p className="text-ink-primary">{FEE_LABEL[fee.kind]}</p>
              {fee.sku ? <p className="text-ink-tertiary font-mono text-xs">{fee.sku}</p> : null}
            </div>
            <div className="text-right tabular-nums">
              <p className="text-ink-primary font-medium">{money(fee.amount)}</p>
              {fee.tax != null ? (
                <p className="text-ink-tertiary text-xs">
                  VAT {ratePercent(fee.taxRate)}: {money(fee.tax)}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The quote's lines and fees, read only: accepted figures once accepted, proposed before.
 * `markUnsellable` tags a line that can no longer be bought — only while the quote is still
 * open, since an accepted or converted quote's lines are past that question.
 */
export function QuoteLinesCard({
  quote,
  markUnsellable = false,
}: {
  quote: Pick<Quote, "lines" | "fees">;
  markUnsellable?: boolean;
}) {
  return (
    <section className={QUOTE_CARD} aria-labelledby="quote-lines-heading">
      <h2
        id="quote-lines-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Sản phẩm{" "}
        <span className="text-ink-secondary text-sm font-normal tabular-nums">
          ({quote.lines.length} dòng)
        </span>
      </h2>
      <ul className="divide-border-default divide-y">
        {quote.lines.map((line) => (
          <LineItem key={line.id} line={line} markUnsellable={markUnsellable} />
        ))}
      </ul>
      <QuoteFees fees={quote.fees} />
    </section>
  );
}
