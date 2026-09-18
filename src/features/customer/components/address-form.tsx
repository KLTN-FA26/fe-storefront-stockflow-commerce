"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronsUpDown } from "lucide-react";

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

import { addressSchema, type AddressFormValues } from "../schemas";
import { useVietnamAddresses } from "@/hooks/use-vietnam-addresses";

interface AddressOption {
  value: string;
  label: string;
}

interface AddressFormProps {
  defaultValues?: Partial<AddressFormValues>;
  onSubmit: (data: AddressFormValues) => void;
  isSubmitting?: boolean;
}

export function AddressForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
}: AddressFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema) as any,
    defaultValues: {
      recipientName: "",
      recipientPhone: "",
      province: "",
      city: "",
      ward: "",
      line1: "",
      postalCode: "",
      country: "Vietnam",
      isDefault: false,
      ...defaultValues,
    },
  });

  const provinceValue = watch("province");
  const wardValue = watch("ward");

  const [provinceCode, setProvinceCode] = useState("");
  const { provinces, wards, loading } = useVietnamAddresses(provinceCode);

  useEffect(() => {
    if (provinceValue && provinces.length > 0) {
      const match = provinces.find((p) => p.label === provinceValue);
      if (match && match.value !== provinceCode) {
        setProvinceCode(match.value);
      }
    } else if (!provinceValue && provinceCode !== "") {
      setProvinceCode("");
    }
  }, [provinceValue, provinces, provinceCode]);

  useEffect(() => {
    const initialProvince = defaultValues?.province ?? "";
    if (provinceValue !== initialProvince && provinceValue !== "") {
      setValue("ward", "", { shouldValidate: false });
    }
  }, [provinceValue, setValue, defaultValues?.province]);

  const mappedProvinces = provinces.map((p) => ({ value: p.label, label: p.label }));
  const mappedWards = wards.map((w) => ({ value: w.label, label: w.label }));

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
      <div className="grid gap-4 rounded-xl bg-bg-surface p-[var(--card-pad)] shadow-sm border border-border-default sm:grid-cols-2">
        <Field label="Người nhận" error={errors.recipientName?.message}>
          <Input placeholder="Nguyễn Văn A" {...register("recipientName")} />
        </Field>

        <Field label="Số điện thoại" error={errors.recipientPhone?.message}>
          <Input placeholder="0900000000" {...register("recipientPhone")} />
        </Field>

        <ComboboxField
          label="Tỉnh/Thành"
          value={provinceValue}
          options={mappedProvinces}
          loading={loading && provinces.length === 0}
          onChange={(val) => setValue("province", val, { shouldValidate: true })}
          error={errors.province?.message}
        />

        <Field label="Thành phố trực thuộc tỉnh (Không bắt buộc)" error={errors.city?.message}>
          <Input placeholder="Ví dụ: TP. Thủ Đức" {...register("city")} />
        </Field>

        <ComboboxField
          label="Phường/Xã"
          value={wardValue}
          options={mappedWards}
          loading={loading && provinceCode !== "" && wards.length === 0}
          disabled={!provinceValue}
          onChange={(val) => setValue("ward", val, { shouldValidate: true })}
          error={errors.ward?.message}
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
          checked={watch("isDefault")}
          onCheckedChange={(checked) => setValue("isDefault", checked === true)}
        />
        <Label
          htmlFor="isDefault"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function ComboboxField({
  label,
  value,
  options,
  loading,
  disabled,
  error,
  onChange,
}: {
  label: string;
  value: string;
  options: AddressOption[];
  loading: boolean;
  disabled?: boolean | undefined;
  error?: string | undefined;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const isDisabled = disabled || loading || options.length === 0;

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
              "h-10 w-full justify-between rounded-[var(--r-md)] border-border-default bg-bg-surface px-3 font-normal text-ink-primary shadow-sm hover:bg-bg-subtle",
              error && "border-danger focus-visible:ring-danger"
            )}
          >
            <span className={cn("truncate", !selected && "text-ink-tertiary")}>
              {selected?.label ?? (loading ? "Đang tải..." : `Chọn ${label.toLowerCase()}`)}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 text-ink-tertiary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] border-border-default bg-bg-surface p-1 text-ink-primary shadow-md"
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
                      onChange(option.value);
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
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
