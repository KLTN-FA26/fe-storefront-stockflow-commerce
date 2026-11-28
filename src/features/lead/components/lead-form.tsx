"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send } from "lucide-react";
import { useForm, type UseFormSetError } from "react-hook-form";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/error";

import { describeLeadError, useSubmitLead } from "../mutations";
import {
  EMPTY_LEAD_FORM,
  leadFormSchema,
  toLeadRequest,
  type LeadFormInput,
  type LeadFormValues,
} from "../schemas";
import { LeadConsentField, LeadInterestsField } from "./lead-choice-fields";
import { fieldA11y, INPUT, LeadField, LeadFieldset } from "./lead-field";
import { LeadProvinceField } from "./lead-province-field";

const FIELDS = new Set<string>(Object.keys(EMPTY_LEAD_FORM));

/** A field the BE refused goes back under its input (the BE words it in Vietnamese). */
function showFieldErrors(error: unknown, setError: UseFormSetError<LeadFormInput>) {
  if (!(error instanceof ApiError)) return;
  for (const { field, message } of error.fieldErrorDetails) {
    if (FIELDS.has(field)) setError(field as keyof LeadFormInput, { message });
  }
}

export function LeadForm({ onSent }: { onSent: () => void }) {
  const submit = useSubmitLead();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: EMPTY_LEAD_FORM,
  });

  const send = handleSubmit((values) => {
    // The honeypot is filled: a bot. It is told what a person is told, and nothing is sent.
    if (values.website.trim() !== "") {
      onSent();
      return;
    }
    submit.mutate(toLeadRequest(values), {
      onSuccess: onSent,
      onError: (error) => showFieldErrors(error, setError),
    });
  });

  const text = (id: string, name: keyof LeadFormInput, extra: Record<string, unknown> = {}) => (
    <Input
      {...fieldA11y(id, errors[name]?.message)}
      className={INPUT}
      {...extra}
      {...register(name)}
    />
  );

  return (
    <form onSubmit={send} noValidate className="grid gap-8">
      <LeadFieldset legend="Doanh nghiệp">
        <LeadField
          id="lead-company"
          label="Tên công ty"
          error={errors.companyName?.message}
          className="sm:col-span-2"
        >
          {text("lead-company", "companyName", { autoComplete: "organization" })}
        </LeadField>
        <LeadField
          id="lead-tax-code"
          label="Mã số thuế"
          hint="10 số, hoặc 13 số với đơn vị phụ thuộc"
          error={errors.taxCode?.message}
        >
          {text("lead-tax-code", "taxCode", { inputMode: "numeric", spellCheck: false })}
        </LeadField>
        <LeadProvinceField control={control} />
      </LeadFieldset>

      <LeadFieldset legend="Người liên hệ">
        <LeadField id="lead-contact" label="Họ và tên" error={errors.contactName?.message}>
          {text("lead-contact", "contactName", { autoComplete: "name" })}
        </LeadField>
        <LeadField id="lead-title" label="Chức vụ" optional error={errors.contactTitle?.message}>
          {text("lead-title", "contactTitle", { autoComplete: "organization-title" })}
        </LeadField>
        <LeadField id="lead-phone" label="Số điện thoại" error={errors.phone?.message}>
          {text("lead-phone", "phone", { type: "tel", inputMode: "tel", autoComplete: "tel" })}
        </LeadField>
        <LeadField id="lead-email" label="Email" error={errors.email?.message}>
          {text("lead-email", "email", { type: "email", autoComplete: "email", spellCheck: false })}
        </LeadField>
      </LeadFieldset>

      <LeadFieldset legend="Nhu cầu">
        <LeadInterestsField control={control} />
        <LeadField
          id="lead-volume"
          label="Sản lượng dự kiến mỗi tháng"
          optional
          hint="Ví dụ: khoảng 20.000 ly"
          error={errors.monthlyVolume?.message}
          className="sm:col-span-2"
        >
          {text("lead-volume", "monthlyVolume")}
        </LeadField>
        <LeadField
          id="lead-note"
          label="Ghi chú"
          optional
          error={errors.note?.message}
          className="sm:col-span-2"
        >
          <Textarea
            {...fieldA11y("lead-note", errors.note?.message)}
            rows={3}
            {...register("note")}
          />
        </LeadField>
      </LeadFieldset>

      {/* Honeypot: off screen, out of the tab order and hidden from assistive technology. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="lead-website">Website</label>
        <input
          id="lead-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      <LeadConsentField control={control} />

      {submit.error ? (
        <div role="alert">
          <Alert tone="danger">{describeLeadError(submit.error)}</Alert>
        </div>
      ) : null}

      <Button
        type="submit"
        className="min-h-11 w-full rounded-[var(--r-md)] sm:w-auto sm:justify-self-start sm:px-6"
        disabled={submit.isPending}
      >
        {submit.isPending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Send aria-hidden className="size-4" />
        )}
        {submit.isPending ? "Đang gửi..." : "Gửi yêu cầu"}
      </Button>
    </form>
  );
}
