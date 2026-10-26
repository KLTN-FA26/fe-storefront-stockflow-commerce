"use client";

import { useWatch, type UseFormReturn } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { ADDRESS_TYPES, addressTypeSchema } from "../schemas";
import { ADDRESS_TYPE_LABELS } from "../selectors";
import type { AddressFormInput, AddressFormValues } from "../types";

type AddressForm = UseFormReturn<AddressFormInput, unknown, AddressFormValues>;

/** SHIPPING / BILLING radio cards — BE keeps a separate default for each type. */
export function AddressTypeField({ form }: { form: AddressForm }) {
  const type = useWatch({ control: form.control, name: "type" });
  const error = form.formState.errors.type?.message;

  return (
    <fieldset className="bg-bg-surface border-border-default space-y-3 rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-sm">
      <legend className="text-ink-primary px-1 text-sm font-semibold">Loại địa chỉ</legend>
      <RadioGroup
        value={type}
        onValueChange={(value) =>
          form.setValue("type", addressTypeSchema.parse(value), { shouldDirty: true })
        }
        className="grid-cols-2"
        aria-invalid={!!error}
        aria-describedby={error ? "address-type-error" : undefined}
      >
        {ADDRESS_TYPES.map((value) => (
          <Label
            key={value}
            className={cn(
              "border-border-default flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--r-lg)] border px-4",
              type === value && "border-accent bg-bg-subtle",
            )}
          >
            <RadioGroupItem value={value} />
            {ADDRESS_TYPE_LABELS[value]}
          </Label>
        ))}
      </RadioGroup>
      {error && (
        <p id="address-type-error" className="text-danger text-xs">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * `locked` while editing the current default of the same type: BE keeps it default unless
 * another default of that type exists (Customer.updateAddress `mustRemainDefault`), so an
 * untick would be silently ignored.
 */
export function DefaultAddressField({ form, locked }: { form: AddressForm; locked: boolean }) {
  const [type, defaultAddress] = useWatch({
    control: form.control,
    name: ["type", "defaultAddress"],
  });

  return (
    <div className="space-y-1">
      <Label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          checked={locked || defaultAddress}
          disabled={locked}
          onCheckedChange={(checked) =>
            form.setValue("defaultAddress", checked === true, { shouldDirty: true })
          }
        />
        Đặt làm địa chỉ {ADDRESS_TYPE_LABELS[type].toLowerCase()} mặc định
      </Label>
      <p className="text-ink-tertiary text-xs">
        {locked
          ? "Đây là địa chỉ mặc định. Hãy chọn địa chỉ khác làm mặc định nếu muốn bỏ."
          : "Địa chỉ đầu tiên của mỗi loại sẽ tự động là mặc định."}
      </p>
    </div>
  );
}
