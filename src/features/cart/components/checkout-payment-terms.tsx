"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "cn";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { describeApiError } from "@/lib/api/describe-error";
import { formatMoney } from "@/lib/format/money";

import {
  depositAmount,
  type PaymentTermChoice,
  type PaymentTermOption,
} from "../checkout-payment-terms";
import type { CheckoutPaymentTerm } from "../checkout-schemas";

interface CheckoutPaymentTermsProps {
  /** The terms the customer may use; undefined while loading, on error, or when none is known. */
  terms: PaymentTermChoice | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  /** The term the order will be placed on. */
  value: CheckoutPaymentTerm | undefined;
  onChange: (term: CheckoutPaymentTerm) => void;
  /** An earlier pick is waiting for the terms: ordering is paused until they load. */
  awaitingChoice?: boolean;
  /** The cart's subtotal, for the deposit the DEPOSIT term asks up front. */
  subtotal: number;
}

const GENERIC =
  "Đơn được thanh toán theo điều khoản đã thoả thuận với Sales cho tài khoản của bạn (trả trước, đặt cọc hoặc công nợ). Sau khi đặt, đơn hàng cho biết số tiền cần thanh toán.";

/**
 * How the order is paid (kltn-docs 15 BR-01): a radio per term the customer is allowed, the default
 * preselected. With one allowed term there is nothing to choose, so it is stated, not offered. The
 * credit limit and what is owed are back-office data and are never shown here.
 */
export function CheckoutPaymentTerms({
  terms,
  isLoading,
  error,
  onRetry,
  value,
  onChange,
  subtotal,
  awaitingChoice = false,
}: CheckoutPaymentTermsProps) {
  if (isLoading) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-20 w-full rounded-[var(--r-md)]" />
    );
  }
  // Terms read earlier are kept when a refetch fails, and then they are what is shown and sent.
  if (error && !terms) {
    return (
      <div className="space-y-3" role="alert">
        <Alert tone="warning" title="Không tải được điều khoản thanh toán.">
          {describeApiError(error)}{" "}
          {awaitingChoice
            ? "Hãy thử lại để đặt đơn theo hình thức bạn đã chọn trước đó."
            : "Nếu đặt hàng lúc này, đơn dùng điều khoản mặc định của tài khoản bạn."}
        </Alert>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          onClick={onRetry}
        >
          <RefreshCw aria-hidden className="mr-2 size-4" />
          Thử lại
        </Button>
      </div>
    );
  }
  if (!terms) return <p className="text-ink-secondary text-sm">{GENERIC}</p>;

  const selected = terms.options.find((option) => option.term === value) ?? terms.options[0];
  const deposit =
    selected?.term === "DEPOSIT" && terms.depositPercent && subtotal > 0
      ? depositAmount(subtotal, terms.depositPercent)
      : undefined;
  const note =
    deposit === undefined ? null : (
      <p className="text-ink-secondary text-sm">
        Tiền cọc dự kiến:{" "}
        <span className="text-ink-primary font-semibold tabular-nums">{formatMoney(deposit)}</span>.
        Số tiền chính xác được xác nhận khi đặt hàng.
      </p>
    );

  if (terms.options.length === 1 && selected) {
    return (
      <div className="space-y-2">
        <Option option={selected} chosen />
        {note}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <RadioGroup
        {...(selected ? { value: selected.term } : {})}
        onValueChange={(next) => onChange(next as CheckoutPaymentTerm)}
        className="grid gap-3"
        aria-label="Hình thức thanh toán"
      >
        {terms.options.map((option) => (
          <Option key={option.term} option={option} chosen={option.term === selected?.term} radio />
        ))}
      </RadioGroup>
      {note}
    </div>
  );
}

function Option({
  option,
  chosen,
  radio = false,
}: {
  option: PaymentTermOption;
  chosen: boolean;
  radio?: boolean;
}) {
  const body = (
    <span className="min-w-0 flex-1 text-sm">
      <span className="text-ink-primary block font-semibold">{option.label}</span>
      <span className="text-ink-secondary block font-normal">{option.description}</span>
    </span>
  );
  if (!radio) {
    return (
      <div className="border-border-default bg-bg-surface rounded-[var(--r-md)] border p-3 sm:p-4">
        {body}
      </div>
    );
  }
  return (
    <Label
      htmlFor={`term-${option.term}`}
      className={cn(
        "bg-bg-surface hover:border-border-strong focus-within:ring-accent flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--r-md)] border p-3 text-left font-normal transition-colors focus-within:ring-2 sm:p-4",
        chosen ? "border-accent bg-accent/5" : "border-border-default",
      )}
    >
      <RadioGroupItem id={`term-${option.term}`} value={option.term} className="mt-1" />
      {body}
    </Label>
  );
}
