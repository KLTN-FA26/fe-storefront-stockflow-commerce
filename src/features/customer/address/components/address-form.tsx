"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";

import { describeError, isApiError } from "../errors";
import { ADDRESS_FORM_FIELDS, addressFormSchema } from "../schemas";
import { EMPTY_ADDRESS_FORM, toAddressFormInput } from "../selectors";
import type { AddressFormInput, AddressFormValues, CustomerAddressDto } from "../types";
import { AddressDetailFields } from "./address-detail-fields";
import { AddressTypeField, DefaultAddressField } from "./address-form-options";

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
  const { handleSubmit, setError, reset, control, formState } = form;
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

  const submit = (event: FormEvent<HTMLFormElement>) =>
    handleSubmit((values) => onSubmit(values, baseVersion.current))(event);

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      {showServerAlert && (
        <Alert tone="danger" title="Không lưu được địa chỉ">
          {describeError(serverError)}
        </Alert>
      )}

      <AddressTypeField form={form} />

      <AddressDetailFields form={form} />

      <DefaultAddressField form={form} locked={defaultLocked} />

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="h-11 rounded-full px-8">
          {isSubmitting ? "Đang lưu..." : "Lưu địa chỉ"}
        </Button>
      </div>
    </form>
  );
}
