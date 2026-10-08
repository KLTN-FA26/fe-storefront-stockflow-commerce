"use client";

import type { HTMLAttributes } from "react";
import type { UseFormReturn } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { AddressFormInput, AddressFormValues } from "../types";
import { AddressRegionFields } from "./address-region-fields";

type AddressForm = UseFormReturn<AddressFormInput, unknown, AddressFormValues>;
type TextFieldName = "recipientName" | "phone" | "line1" | "line2" | "postalCode";

interface TextFieldConfig {
  name: TextFieldName;
  label: string;
  placeholder: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}

const CONTACT_FIELDS: readonly TextFieldConfig[] = [
  { name: "recipientName", label: "Người nhận", placeholder: "Nguyễn Văn A" },
  { name: "phone", label: "Số điện thoại", placeholder: "0901234567", inputMode: "tel" },
];

const STREET_FIELDS: readonly TextFieldConfig[] = [
  { name: "line1", label: "Số nhà, tên đường", placeholder: "Ví dụ: 12 Nguyễn Huệ" },
  {
    name: "line2",
    label: "Toà nhà, tầng, căn hộ (không bắt buộc)",
    placeholder: "Ví dụ: Toà A, tầng 5, căn 502",
  },
  {
    name: "postalCode",
    label: "Mã bưu chính (không bắt buộc)",
    placeholder: "700000",
    inputMode: "numeric",
  },
];

/** Recipient, phone, province → ward cascade and street lines, in reading order. */
export function AddressDetailFields({ form }: { form: AddressForm }) {
  return (
    <div className="bg-bg-surface border-border-default grid gap-4 rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-sm sm:grid-cols-2">
      {CONTACT_FIELDS.map((field) => (
        <TextField key={field.name} form={form} {...field} />
      ))}
      <AddressRegionFields form={form} />
      {STREET_FIELDS.map((field) => (
        <TextField key={field.name} form={form} {...field} />
      ))}
    </div>
  );
}

function TextField({
  form,
  name,
  label,
  placeholder,
  inputMode,
}: TextFieldConfig & { form: AddressForm }) {
  const error = form.formState.errors[name]?.message;
  const errorId = `${name}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={name} className={cn(error && "text-danger")}>
        {label}
      </Label>
      <Input
        id={name}
        className="h-11"
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        {...form.register(name)}
      />
      {error && (
        <p id={errorId} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
