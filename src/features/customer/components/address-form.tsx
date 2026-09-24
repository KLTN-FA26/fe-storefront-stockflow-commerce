"use client";
/* eslint-disable react-hooks/incompatible-library */

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

import { saveAddressInputSchema, type SaveAddressInput } from "../schemas";
import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

interface AddressFormProps {
  defaultValues?: Partial<SaveAddressInput>;
  onSubmit: (data: SaveAddressInput) => void;
  isSubmitting?: boolean;
}

export function AddressForm({ defaultValues, onSubmit, isSubmitting = false }: AddressFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<SaveAddressInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod v4 / hookform-resolvers mismatch
    resolver: zodResolver(saveAddressInputSchema as any),
    defaultValues: {
      type: "SHIPPING",
      recipientName: "",
      phone: "",
      line1: "",
      line2: "",
      wardCode: "",
      wardName: "",
      provinceCode: "",
      provinceName: "",
      countryCode: "VN",
      postalCode: "",
      defaultAddress: false,
      ...defaultValues,
    },
  });

  // Re-sync form when parent passes new defaultValues (edit page: address loads async).
  // Without this, react-hook-form keeps the empty initial defaults forever.
  const defaultsKey = JSON.stringify(defaultValues ?? {});
  useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      reset((prev) => ({ ...prev, ...defaultValues }) as SaveAddressInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsKey, reset]);

  const provinceCodeWatch = watch("provinceCode");

  const provinceNameWatch = watch("provinceName");
  const wardCodeWatch = watch("wardCode");
  const wardNameWatch = watch("wardName");
  const defaultAddressWatch = watch("defaultAddress");

  const [activeProvinceCode, setActiveProvinceCode] = useState(provinceCodeWatch ?? "");
  const { provinces, wards, loading } = useVietnamAddresses(activeProvinceCode);

  // Keep activeProvinceCode in sync when user picks province or when form is reset from parent
  useEffect(() => {
    if (provinceCodeWatch && provinceCodeWatch !== activeProvinceCode) {
      setActiveProvinceCode(provinceCodeWatch);
    } else if (!provinceCodeWatch && activeProvinceCode !== "") {
      setActiveProvinceCode("");
    }
  }, [provinceCodeWatch, activeProvinceCode]);

  // Ensure the edit-saved value is still shown even when BE/mock wardCode
  // does not match open-api (e.g. mock "W-PHNGPHMNG" vs real numeric codes).
  // Otherwise the combobox appears empty while the trigger still shows displayValue,
  // and opening it renders "Không tìm thấy." until user changes province.
  const effectiveProvinces = useMemo(() => {
    if (
      provinceCodeWatch &&
      provinceNameWatch &&
      !provinces.some((o) => o.value === provinceCodeWatch)
    ) {
      return [{ value: provinceCodeWatch, label: provinceNameWatch }, ...provinces];
    }
    return provinces;
  }, [provinces, provinceCodeWatch, provinceNameWatch]);

  const effectiveWards = useMemo(() => {
    if (wardCodeWatch && wardNameWatch && !wards.some((o) => o.value === wardCodeWatch)) {
      return [{ value: wardCodeWatch, label: wardNameWatch }, ...wards];
    }
    return wards;
  }, [wards, wardCodeWatch, wardNameWatch]);

  const handleProvinceSelect = (code: string, label: string) => {
    const prev = provinceCodeWatch;
    setValue("provinceCode", code, { shouldValidate: true });
    setValue("provinceName", label, { shouldValidate: true });
    setActiveProvinceCode(code);
    if (prev && prev !== code) {
      setValue("wardCode", "", { shouldValidate: false });
      setValue("wardName", "", { shouldValidate: false });
    }
  };

  const handleWardSelect = (code: string, label: string) => {
    setValue("wardCode", code, { shouldValidate: true });
    setValue("wardName", label, { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="bg-bg-surface border-border-default grid gap-4 rounded-xl border p-[var(--card-pad)] shadow-sm sm:grid-cols-2">
        <Field label="Người nhận" error={errors.recipientName?.message}>
          <Input placeholder="Nguyễn Văn A" {...register("recipientName")} />
        </Field>

        <Field label="Số điện thoại" error={errors.phone?.message}>
          <Input placeholder="0900000000" {...register("phone")} />
        </Field>

        <ComboboxField
          label="Tỉnh/Thành"
          value={provinceCodeWatch ?? ""}
          displayValue={provinceNameWatch ?? ""}
          options={effectiveProvinces}
          loading={loading && provinces.length === 0}
          onSelect={handleProvinceSelect}
          error={errors.provinceName?.message ?? errors.provinceCode?.message}
        />

        <Field label="Đường/ấp thêm (không bắt buộc)" error={errors.line2?.message}>
          <Input placeholder="Ví dụ: TP. Thủ Đức" {...register("line2")} />
        </Field>

        <ComboboxField
          label="Phường/Xã"
          value={wardCodeWatch ?? ""}
          displayValue={wardNameWatch ?? ""}
          options={effectiveWards}
          loading={loading && !!activeProvinceCode && wards.length === 0}
          disabled={!provinceCodeWatch}
          onSelect={handleWardSelect}
          error={errors.wardName?.message ?? errors.wardCode?.message}
        />

        <Field label="Địa chỉ chi tiết" error={errors.line1?.message}>
          <Input placeholder="Số nhà, tên đường..." {...register("line1")} />
        </Field>

        <Field label="Mã bưu điện (Postal Code)" error={errors.postalCode?.message}>
          <Input placeholder="700000" {...register("postalCode")} />
        </Field>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isDefault"
          checked={!!defaultAddressWatch}
          onCheckedChange={(checked) => setValue("defaultAddress", checked === true)}
        />
        <Label
          htmlFor="isDefault"
          className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Đặt làm địa chỉ mặc định
        </Label>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="submit" disabled={isSubmitting} className="rounded-full px-8">
          {isSubmitting ? "Đang lưu..." : "Lưu địa chỉ"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className={cn(error && "text-danger")}>{label}</Label>
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}

function ComboboxField({
  label,
  value,
  displayValue,
  options,
  loading,
  disabled,
  error,
  onSelect,
}: {
  label: string;
  value: string;
  displayValue: string;
  options: { value: string; label: string }[];
  loading: boolean;
  disabled?: boolean;
  error?: string | undefined;
  onSelect: (code: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const isDisabled = Boolean(disabled);

  return (
    <div className="space-y-2">
      <Label className={cn(error && "text-danger")}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={isDisabled}
            className={cn(
              "border-border-default bg-bg-surface text-ink-primary hover:bg-bg-subtle h-10 w-full justify-between rounded-[var(--r-md)] px-3 font-normal shadow-sm",
              error && "border-danger focus-visible:ring-danger",
            )}
          >
            <span
              className={cn("truncate", !selected?.label && !displayValue && "text-ink-tertiary")}
            >
              {selected?.label ||
                displayValue ||
                (loading ? "Đang tải..." : `Chọn ${label.toLowerCase()}`)}
            </span>
            <ChevronsUpDown className="text-ink-tertiary ml-2 size-4 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="border-border-default bg-bg-surface text-ink-primary w-[--radix-popover-trigger-width] p-1 shadow-md"
          align="start"
        >
          <Command className="bg-bg-surface text-ink-primary">
            <CommandInput
              placeholder={`Tìm ${label.toLowerCase()}...`}
              className="text-ink-primary placeholder:text-ink-tertiary"
            />
            <CommandList>
              <CommandEmpty className="text-ink-secondary">Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    data-checked={option.value === value}
                    className="text-ink-primary data-selected:bg-bg-muted data-selected:text-ink-primary"
                    onSelect={() => {
                      onSelect(option.value, option.label);
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
