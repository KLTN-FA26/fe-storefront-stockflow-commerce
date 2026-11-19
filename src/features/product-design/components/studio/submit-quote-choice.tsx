"use client";

import type { UseFormReturn } from "react-hook-form";

import { RadioGroup } from "@/components/ui/radio-group";

import type { QuoteRequestFormValues, QuoteRequestInput } from "../../types";
import { QuoteRequestFields } from "../quote-request-parts";
import { RadioCard } from "./radio-card";

/**
 * How the confirmed design is sent (docs 12 §4.8.24): for review only, the plain submission, or
 * "Gửi duyệt và yêu cầu báo giá" with the cartons wished for and, if any, a delivery date. The
 * request reaches the sales staff at once; they quote once the design is approved (BR-15).
 */
export function SubmitQuoteChoice({
  withQuote,
  onWithQuoteChange,
  form,
  disabled = false,
}: {
  withQuote: boolean;
  onWithQuoteChange: (withQuote: boolean) => void;
  form: UseFormReturn<QuoteRequestFormValues, unknown, QuoteRequestInput>;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <RadioGroup
        aria-label="Cách gửi"
        value={withQuote ? "quote" : "review"}
        onValueChange={(value) => onWithQuoteChange(value === "quote")}
        disabled={disabled}
        className="grid gap-2"
      >
        <RadioCard value="review" chosen={!withQuote} className="grid gap-0.5 px-3 py-2">
          <span className="text-ink-primary text-sm font-medium">Chỉ gửi duyệt</span>
          <span className="text-ink-tertiary text-xs">
            Yêu cầu báo giá sau, khi bản đã được duyệt.
          </span>
        </RadioCard>
        <RadioCard value="quote" chosen={withQuote} className="grid gap-0.5 px-3 py-2">
          <span className="text-ink-primary text-sm font-medium">Gửi duyệt và yêu cầu báo giá</span>
          <span className="text-ink-tertiary text-xs">
            Sale nhận yêu cầu ngay và báo giá khi bản được duyệt.
          </span>
        </RadioCard>
      </RadioGroup>
      {withQuote ? (
        <QuoteRequestFields
          register={form.register}
          errors={form.formState.errors}
          idPrefix="submit-quote"
          disabled={disabled}
        />
      ) : null}
    </div>
  );
}
