"use client";

import { useController, type Control } from "react-hook-form";

import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import {
  LEAD_INTEREST_LABELS,
  LEAD_INTERESTS,
  type LeadFormInput,
  type LeadFormValues,
  type LeadInterest,
} from "../schemas";
import { FieldError } from "./lead-field";

type LeadControl = Control<LeadFormInput, unknown, LeadFormValues>;

const CHOICE =
  "border-border-default has-[[data-state=checked]]:border-accent has-[[data-state=checked]]:bg-bg-subtle flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-md)] border px-3 text-sm font-medium";

/** Ly / hộp / túi / tô: any number of them, none is fine. */
export function LeadInterestsField({ control }: { control: LeadControl }) {
  const { field } = useController({ control, name: "interests" });
  const chosen = new Set<LeadInterest>(field.value);
  const toggle = (interest: LeadInterest, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(interest);
    else next.delete(interest);
    // Kept in the order of the list, whatever order they were ticked in.
    field.onChange(LEAD_INTERESTS.filter((value) => next.has(value)));
  };

  return (
    <fieldset className="grid gap-1.5 sm:col-span-2">
      <legend className="text-ink-primary mb-1.5 text-sm font-medium">
        Sản phẩm quan tâm <span className="text-ink-tertiary font-normal">(không bắt buộc)</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {LEAD_INTERESTS.map((interest) => (
          <Label key={interest} className={CHOICE}>
            <Checkbox
              aria-label={LEAD_INTEREST_LABELS[interest]}
              checked={chosen.has(interest)}
              onCheckedChange={(checked) => toggle(interest, checked === true)}
            />
            {LEAD_INTEREST_LABELS[interest]}
          </Label>
        ))}
      </div>
    </fieldset>
  );
}

/** Required: the details are processed only with the person's consent (Nghị định 13/2023/NĐ-CP). */
export function LeadConsentField({ control }: { control: LeadControl }) {
  const {
    field: { value, onChange, onBlur },
    fieldState,
  } = useController({ control, name: "consent" });
  const error = fieldState.error?.message;
  return (
    <div className="grid gap-1.5">
      <Label
        htmlFor="lead-consent"
        className={cn(
          "items-start gap-3 text-sm leading-6 font-normal",
          error ? "text-danger-ink" : "text-ink-secondary",
        )}
      >
        <Checkbox
          id="lead-consent"
          checked={value}
          onCheckedChange={(checked) => onChange(checked === true)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "lead-consent-error" : undefined}
          aria-labelledby="lead-consent-text"
          className="mt-1"
        />
        <span id="lead-consent-text">
          Tôi đồng ý để StockFlow xử lý các thông tin trên nhằm liên hệ tư vấn và mở tài khoản, theo
          Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
        </span>
      </Label>
      <FieldError id="lead-consent" error={error} />
    </div>
  );
}
