"use client";

// TODO(SCRUM-375-followup): guest/local form. Shares Vietnam address logic
// (useVietnamAddresses) with `features/customer/address/components/address-form.tsx` but
// does not call customer address API. Keep `phone` regex and ward/province
// validation in sync with `features/customer/address/schemas.ts` (VietnamPhoneValidator).
// Follow-up: unify or make checkout pick from saved addresses when logged in.

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { SurfaceCard } from "@/components/storefront/layout";

export interface AddressFormValue {
  name: string;
  phone: string;
  province: string;
  ward: string;
  line1: string;
}

interface AddressOption {
  value: string;
  label: string;
}

interface AddressFormProps {
  value: AddressFormValue;
  provinces: AddressOption[];
  wards: AddressOption[];
  loading?: boolean;
  onChange: (value: AddressFormValue) => void;
}

export function AddressForm({ value, provinces, wards, loading = false, onChange }: AddressFormProps) {
  const setField = (field: keyof AddressFormValue, next: string) => onChange({ ...value, [field]: next });
  const setProvince = (province: string) => onChange({ ...value, province, ward: "" });

  return (
    <SurfaceCard className="grid gap-4 sm:grid-cols-2">
      <Field label="Người nhận"><Input className="min-h-11" value={value.name} onChange={(event) => setField("name", event.target.value)} /></Field>
      <Field label="Số điện thoại"><Input className="min-h-11" value={value.phone} onChange={(event) => setField("phone", event.target.value)} /></Field>
      <ComboboxField label="Tỉnh/Thành" value={value.province} options={provinces} loading={loading} onChange={setProvince} />
      <ComboboxField label="Phường/Xã" value={value.ward} options={wards} loading={loading} disabled={!value.province} onChange={(next) => setField("ward", next)} />
      <Field label="Địa chỉ chi tiết"><Input className="min-h-11" value={value.line1} onChange={(event) => setField("line1", event.target.value)} /></Field>
    </SurfaceCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function ComboboxField({ label, value, options, loading, disabled, onChange }: { label: string; value: string; options: AddressOption[]; loading: boolean; disabled?: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const isDisabled = disabled || loading || options.length === 0;

  return (
    <Field label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={isDisabled} className="min-h-11 w-full justify-between rounded-[var(--r-md)] border-border-default bg-bg-surface px-3 font-normal text-ink-primary shadow-sm hover:bg-bg-subtle">
            <span className={cn("truncate", !selected && "text-ink-tertiary")}>{selected?.label ?? (loading ? "Đang tải..." : `Chọn ${label.toLowerCase()}`)}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 text-ink-tertiary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) border-border-default bg-bg-surface p-1 text-ink-primary shadow-md" align="start">
          <Command className="bg-bg-surface text-ink-primary">
            <CommandInput placeholder={`Tìm ${label.toLowerCase()}...`} className="text-ink-primary placeholder:text-ink-tertiary" />
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
                    <Check className={cn("size-4 text-accent", option.value === value ? "opacity-100" : "opacity-0")} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
