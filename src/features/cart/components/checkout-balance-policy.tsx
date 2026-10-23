import { RadioGroup } from "@/components/ui/radio-group";
import { formatMoney } from "@/lib/format/money";
import type { CreditSummary } from "@/lib/payment-terms";

import type { BalancePolicyChoice } from "../checkout-payment-terms";
import type { BalancePolicy } from "../checkout-schemas";
import { ChoiceCard } from "./choice-card";
import { CreditNote } from "./credit-note";

interface CheckoutBalancePolicyProps {
  choice: BalancePolicyChoice;
  value: BalancePolicy | undefined;
  onChange: (policy: BalancePolicy) => void;
  /** The balance after the deposit, estimated from the cart; undefined when it cannot be told. */
  balance: number | undefined;
  /** The customer's credit position, shown next to the credit option. */
  credit: CreditSummary | undefined;
}

/**
 * For a DEPOSIT order: how the rest, after the deposit, is paid. Only the policies the BE allows the
 * customer are offered (`allowedBalancePolicies`). Next to the credit option sits the credit left
 * against the balance, so a customer who cannot use it learns that before the BE refuses.
 */
export function CheckoutBalancePolicy({
  choice,
  value,
  onChange,
  balance,
  credit,
}: CheckoutBalancePolicyProps) {
  const selected = value ?? choice.options[0]?.policy;
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-ink-primary text-sm font-semibold">Phần còn lại sau đặt cọc</h3>
        {balance !== undefined && balance > 0 ? (
          <p className="text-ink-secondary text-sm">
            Dự kiến{" "}
            <span className="text-ink-primary font-semibold tabular-nums">
              {formatMoney(balance)}
            </span>
            . Bạn muốn thanh toán khi nào?
          </p>
        ) : null}
      </div>
      <RadioGroup
        {...(selected ? { value: selected } : {})}
        onValueChange={(next) => onChange(next as BalancePolicy)}
        className="grid gap-3"
        aria-label="Thanh toán phần còn lại"
      >
        {choice.options.map((option) => (
          <ChoiceCard
            key={option.policy}
            id={`balance-${option.policy}`}
            value={option.policy}
            label={option.label}
            description={option.description}
            chosen={option.policy === selected}
          />
        ))}
      </RadioGroup>
      {selected === "ON_CREDIT" && credit && balance !== undefined && balance > 0 ? (
        <CreditNote credit={credit} total={balance} mode="balance" />
      ) : null}
    </div>
  );
}
