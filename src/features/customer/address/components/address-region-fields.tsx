"use client";

import { useMemo } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";

import { Alert, SearchableCombobox, type ComboboxOption } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

import type { AddressFormInput, AddressFormValues } from "../types";

type AddressForm = UseFormReturn<AddressFormInput, unknown, AddressFormValues>;

/** Keep a saved code selectable even when the province API does not list it. */
function withSavedOption(options: ComboboxOption[], value: string, label: string) {
  if (!value || !label || options.some((option) => option.value === value)) return options;
  return [{ value, label }, ...options];
}

const DIRTY = { shouldDirty: true, shouldValidate: true } as const;

/** Vietnam province → ward cascade (2-level, after the 2025 administrative merge). */
export function AddressRegionFields({ form }: { form: AddressForm }) {
  const { control, setValue, formState } = form;
  const [provinceCode, provinceName, wardCode, wardName] = useWatch({
    control,
    name: ["provinceCode", "provinceName", "wardCode", "wardName"],
  });
  const { provinces, wards, loading, error: regionError, retry } = useVietnamAddresses(provinceCode);

  const provinceOptions = useMemo(
    () => withSavedOption(provinces, provinceCode, provinceName),
    [provinces, provinceCode, provinceName],
  );
  const wardOptions = useMemo(
    () => withSavedOption(wards, wardCode, wardName),
    [wards, wardCode, wardName],
  );

  const selectProvince = (option: ComboboxOption) => {
    if (option.value !== provinceCode) {
      setValue("wardCode", "", { shouldDirty: true });
      setValue("wardName", "", { shouldDirty: true });
    }
    setValue("provinceCode", option.value, DIRTY);
    setValue("provinceName", option.label, DIRTY);
  };

  const selectWard = (option: ComboboxOption) => {
    setValue("wardCode", option.value, DIRTY);
    setValue("wardName", option.label, DIRTY);
  };

  const { errors } = formState;

  return (
    <>
      {regionError && (
        <div className="space-y-2 sm:col-span-2">
          <Alert tone="warning" title="Chưa tải được danh sách tỉnh/thành, phường/xã">
            {regionError.message}
          </Alert>
          <Button type="button" variant="outline" className="h-11 rounded-full" onClick={retry}>
            Thử lại
          </Button>
        </div>
      )}
      <SearchableCombobox
        label="Tỉnh/Thành phố"
        value={provinceCode}
        displayValue={provinceName}
        options={provinceOptions}
        loading={loading && provinces.length === 0}
        onSelect={selectProvince}
        error={errors.provinceCode?.message ?? errors.provinceName?.message}
      />
      <SearchableCombobox
        label="Phường/Xã"
        value={wardCode}
        displayValue={wardName}
        options={wardOptions}
        loading={loading && !!provinceCode && wards.length === 0}
        disabled={!provinceCode}
        onSelect={selectWard}
        error={errors.wardCode?.message ?? errors.wardName?.message}
      />
    </>
  );
}
