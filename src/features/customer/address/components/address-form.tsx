"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { cn } from "@/lib/utils";
import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { describeError, isApiError } from "../errors";
import { ADDRESS_FORM_FIELDS, addressFormSchema } from "../schemas";
import { EMPTY_ADDRESS_FORM, toAddressFormInput } from "../selectors";
import type { AddressFormInput, AddressFormValues, CustomerAddressDto } from "../types";
import { AddressTypeField, DefaultAddressField } from "./address-form-options";
import { AddressRegionFields } from "./address-region-fields";

interface AddressFormProps {
  /** Server snapshot when editing. Re-applied only while the form is not dirty. */
  snapshot?: CustomerAddressDto | undefined;
  /** `version` is the snapshot version the form was last reset from (null when creating). */
  onSubmit: (values: AddressFormValues, version: number | null) => void;
  isSubmitting?: boolean;
  /** Last save failure (ApiError, network or contract error). */
  serverError?: unknown;
}

const isFormField = (field: string): field is keyof AddressFormInput =>
  (ADDRESS_FORM_FIELDS as readonly string[]).includes(field);
// Fields that render their own error line; anything else falls back to the form-level alert.
const isRenderedField = (field: string) => isFormField(field) && field !== "defaultAddress";

/** Links an input to its error line for screen readers. */
const a11y = (id: string, error: string | undefined) => ({
  id,
  "aria-invalid": !!error,
  "aria-describedby": error ? `${id}-error` : undefined,
});

export function AddressForm({
  snapshot,
  onSubmit,
  isSubmitting = false,
  serverError,
}: AddressFormProps) {
  const form = useForm<AddressFormInput, unknown, AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: snapshot ? toAddressFormInput(snapshot) : EMPTY_ADDRESS_FORM,
    mode: "onBlur",
  });
  const { register, handleSubmit, setError, reset, control, formState } = form;
  const baseVersion = useRef<number | null>(snapshot?.version ?? null);

  // A background refetch must not overwrite what the customer is typing.
  useEffect(() => {
    if (snapshot && !formState.isDirty) {
      reset(toAddressFormInput(snapshot));
      baseVersion.current = snapshot.version;
    }
  }, [snapshot, formState.isDirty, reset]);

  // Put BE fieldErrors (VALIDATION_FAILED) under the matching inputs.
  const serverFieldErrors = (isApiError(serverError) && serverError.fieldErrors) || {};
  useEffect(() => {
    if (!isApiError(serverError)) return;
    for (const [field, message] of Object.entries(serverError.fieldErrors ?? {})) {
      if (isFormField(field)) setError(field, { type: "server", message });
    }
  }, [serverError, setError]);
  const showServerAlert =
    !!serverError &&
    (Object.keys(serverFieldErrors).length === 0 ||
      Object.keys(serverFieldErrors).some((field) => !isRenderedField(field)));

  const type = useWatch({ control, name: "type" });
  const defaultLocked = !!snapshot?.defaultAddress && type === snapshot.type;
  const { errors } = formState;

  const submit = (event: FormEvent<HTMLFormElement>) =>
    handleSubmit((values) => onSubmit(values, baseVersion.current))(event);

  return (
    <form
      noValidate
      onSubmit={submit}
      className="space-y-6"
    >
      {showServerAlert && (
        <Alert tone="danger" title="Không lưu được địa chỉ">
          {describeError(serverError)}
        </Alert>
      )}

      <AddressTypeField form={form} />

      <div className="bg-bg-surface border-border-default grid gap-4 rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-sm sm:grid-cols-2">
        <Field id="recipientName" label="Người nhận" error={errors.recipientName?.message}>
          <Input
            {...a11y("recipientName", errors.recipientName?.message)}
            className="h-11"
            placeholder="Nguyễn Văn A"
            {...register("recipientName")}
          />
        </Field>
        <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
          <Input
            {...a11y("phone", errors.phone?.message)}
            className="h-11"
            inputMode="tel"
            placeholder="0901234567"
            {...register("phone")}
          />
        </Field>
        <AddressRegionFields form={form} />
        <Field id="line1" label="Số nhà, tên đường" error={errors.line1?.message}>
          <Input
            {...a11y("line1", errors.line1?.message)}
            className="h-11"
            placeholder="Ví dụ: 12 Nguyễn Huệ"
            {...register("line1")}
          />
        </Field>
        <Field
          id="line2"
          label="Toà nhà, tầng, căn hộ (không bắt buộc)"
          error={errors.line2?.message}
        >
          <Input
            {...a11y("line2", errors.line2?.message)}
            className="h-11"
            placeholder="Ví dụ: Toà A, tầng 5, căn 502"
            {...register("line2")}
          />
        </Field>
        <Field
          id="postalCode"
          label="Mã bưu chính (không bắt buộc)"
          error={errors.postalCode?.message}
        >
          <Input
            {...a11y("postalCode", errors.postalCode?.message)}
            className="h-11"
            inputMode="numeric"
            placeholder="700000"
            {...register("postalCode")}
          />
        </Field>
      </div>

      <DefaultAddressField form={form} locked={defaultLocked} />

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="h-11 rounded-full px-8">
          {isSubmitting ? "Đang lưu..." : "Lưu địa chỉ"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(error && "text-danger")}>
        {label}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-danger text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
