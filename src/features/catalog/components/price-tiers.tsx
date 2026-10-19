import { formatMoney } from "@/lib/format/money";

import type { PriceSchedule } from "@/lib/catalog/types";

const SOURCE_LABEL: Record<string, string> = {
  CUSTOMER: "Bảng giá riêng của bạn",
  SEGMENT: "Bảng giá theo nhóm khách hàng",
  BASE: "Giá niêm yết",
};

/** The customer's price list for one SKU: where it comes from and every quantity tier. */
export function PriceTiers({ schedule, quantity }: { schedule: PriceSchedule; quantity: number }) {
  const tiers = [...schedule.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  const reached = tiers.filter((tier) => tier.minQuantity <= quantity).at(-1);
  return (
    <div className="space-y-2">
      <p className="text-ink-secondary text-sm">
        {SOURCE_LABEL[schedule.source] ?? "Giá của bạn"} · đặt tối thiểu{" "}
        <span className="text-ink-primary font-semibold tabular-nums">{schedule.moq}</span>
      </p>
      {tiers.length > 1 ? (
        <table className="w-full text-sm">
          <caption className="sr-only">Giá theo số lượng</caption>
          <thead>
            <tr className="text-ink-tertiary text-left text-xs">
              <th scope="col" className="py-1 font-medium">
                Số lượng
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Đơn giá
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => {
              const next = tiers[index + 1];
              return (
                <tr
                  key={tier.minQuantity}
                  aria-current={tier === reached ? "true" : undefined}
                  className={
                    tier === reached
                      ? "text-ink-primary border-border-default border-t font-semibold"
                      : "text-ink-secondary border-border-default border-t"
                  }
                >
                  <td className="py-2 tabular-nums">
                    {next
                      ? `${tier.minQuantity} – ${next.minQuantity - 1}`
                      : `từ ${tier.minQuantity}`}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(tier.unitPrice, schedule.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
