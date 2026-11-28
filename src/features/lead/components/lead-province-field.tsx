"use client";

import { useController, type Control } from "react-hook-form";

import { SearchableCombobox } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

import type { LeadFormInput, LeadFormValues } from "../schemas";
import { fieldA11y, INPUT, LeadField } from "./lead-field";

const LABEL = "Tỉnh/Thành phố";

/**
 * The province, from the address book's list (the 2025 two-level units, `useVietnamAddresses`). The lead keeps its
 * name: Sales read it, nothing joins on it. When the list cannot be loaded the visitor types it, rather than being
 * stopped by a third-party service.
 */
export function LeadProvinceField({
  control,
}: {
  control: Control<LeadFormInput, unknown, LeadFormValues>;
}) {
  const {
    field: { name, value, onChange, onBlur },
    fieldState,
  } = useController({ control, name: "province" });
  const { provinces, loading, error } = useVietnamAddresses("");
  const message = fieldState.error?.message;

  if (error) {
    return (
      <LeadField id="lead-province" label={LABEL} error={message}>
        <Input
          {...fieldA11y("lead-province", message)}
          autoComplete="address-level1"
          className={INPUT}
          name={name}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      </LeadField>
    );
  }

  return (
    <SearchableCombobox
      label={LABEL}
      value={provinces.find((option) => option.label === value)?.value ?? ""}
      displayValue={value}
      options={provinces}
      loading={loading}
      error={message}
      onSelect={(option) => onChange(option.label)}
    />
  );
}
