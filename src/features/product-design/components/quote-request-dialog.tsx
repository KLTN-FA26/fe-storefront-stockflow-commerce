"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";

import {
  describeQuoteRequestError,
  isCustomerInactive,
  isTransientFailure,
  quoteFieldErrorsOf,
} from "../quote-request-errors";
import { useRequestDesignQuote } from "../quote-request-mutations";
import { quoteRequestFormSchema } from "../quote-request-schemas";
import type {
  Design,
  DesignQuoteRequest,
  QuoteRequestFormValues,
  QuoteRequestInput,
} from "../types";
import {
  ACTION_BUTTON,
  DIALOG_CONTENT,
  QuoteRequestFields,
  QuoteRequestSent,
} from "./quote-request-parts";

type Props = {
  design: Pick<Design, "id" | "name"> & Partial<Pick<Design, "unitsPerCarton">>;
  /** The request still open: the form starts from it, and asking changes it (200). */
  current: DesignQuoteRequest | null;
  onClose: () => void;
};

/** The form, mounted while the dialog is open: each opening starts from the open request again. */
function QuoteRequestForm({ design, current, onClose }: Props) {
  const ask = useRequestDesignQuote(design.id);
  const {
    control,
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<QuoteRequestFormValues, unknown, QuoteRequestInput>({
    resolver: zodResolver(quoteRequestFormSchema),
    defaultValues: {
      cartons: current ? String(current.cartons) : "",
      desiredDeliveryDate: current?.desiredDeliveryDate ?? "",
    },
  });

  const cartons = useWatch({ control, name: "cartons" });

  const submit = handleSubmit((input) =>
    ask.mutate(input, {
      // A field the BE refused is shown on that field (plan §1.2), not only in the alert.
      onError: (error) => {
        const fields = quoteFieldErrorsOf(error);
        if (fields?.cartons) setError("cartons", { message: fields.cartons });
        if (fields?.desiredDeliveryDate) {
          setError("desiredDeliveryDate", { message: fields.desiredDeliveryDate });
        }
      },
    }),
  );

  if (ask.isSuccess) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Yêu cầu báo giá</DialogTitle>
          <DialogDescription>{design.name}</DialogDescription>
        </DialogHeader>
        <QuoteRequestSent updated={!ask.data.created} chat={{ kind: "DESIGN", id: design.id }} />
        <DialogFooter className="gap-2">
          <Button type="button" className={ACTION_BUTTON} onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </>
    );
  }

  const error = ask.error;
  const onFields = error !== null && quoteFieldErrorsOf(error) !== null;
  const inactive = isCustomerInactive(error);
  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{current ? "Cập nhật yêu cầu báo giá" : "Yêu cầu báo giá"}</DialogTitle>
        <DialogDescription>
          {current
            ? `${design.name} đang có một yêu cầu chờ Sale báo giá. Gửi lại sẽ thay số thùng và ngày giao của yêu cầu đó.`
            : `Gửi Sale số thùng và ngày giao bạn mong muốn cho ${design.name}. Sale sẽ liên hệ qua chat để báo giá.`}
        </DialogDescription>
      </DialogHeader>
      <QuoteRequestFields
        register={register}
        control={control}
        errors={errors}
        idPrefix={`quote-${design.id}`}
        disabled={ask.isPending}
        unitsPerCarton={design.unitsPerCarton}
        cartons={cartons}
      />
      {error && !onFields ? (
        <div role="alert">
          <Alert tone="danger">{describeQuoteRequestError(error)}</Alert>
        </div>
      ) : null}
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className={ACTION_BUTTON}
          disabled={ask.isPending}
          onClick={onClose}
        >
          Huỷ
        </Button>
        <Button type="submit" className={cn(ACTION_BUTTON)} disabled={ask.isPending || inactive}>
          {ask.isPending
            ? "Đang gửi..."
            : isTransientFailure(error)
              ? "Thử lại"
              : current
                ? "Cập nhật yêu cầu"
                : "Gửi yêu cầu"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "Yêu cầu báo giá" on an APPROVED design (docs 12 §4.8.23): the cartons wished for (a suggestion)
 * and, if any, a delivery date. Sent, it says so and offers "Mở chat"; a refusal is worded by the BE,
 * under its field when it names one. A customer who is not active cannot ask again.
 */
export function QuoteRequestDialog({
  open,
  onOpenChange,
  ...props
}: Omit<Props, "onClose"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(DIALOG_CONTENT, "sm:max-w-md")}>
        {open ? <QuoteRequestForm {...props} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
