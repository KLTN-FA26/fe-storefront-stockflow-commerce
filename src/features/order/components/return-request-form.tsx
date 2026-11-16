"use client";

import { useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Alert } from "@/components/shared";
import { PhotoPicker } from "@/components/storefront/photo-picker";
import { QuantityStepper } from "@/components/storefront/quantity-stepper";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_RETURN_REASONS,
  RETURN_DESCRIPTION_MAX,
  RETURN_PHOTO_MAX_BYTES,
  RETURN_PHOTO_MAX_COUNT,
  RETURN_PHOTO_TYPES,
  RETURN_REASON_LABEL,
} from "@/lib/returns";

import {
  RETURN_REASON_HELP,
  returnFormSchema,
  type ReturnFormInput,
  type ReturnFormValues,
  type ReturnableLine,
} from "../return-form";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)] space-y-4";
const HEADING = "font-display text-ink-primary text-base font-semibold";

interface ReturnRequestFormProps {
  lines: readonly ReturnableLine[];
  pending: boolean;
  /** Why the last attempt failed (Vietnamese, by BE code). */
  error: string | undefined;
  onSubmit: (values: ReturnFormValues) => void;
}

function LineRow({
  line,
  value,
  onChange,
  error,
}: {
  line: ReturnableLine;
  value: number;
  onChange: (value: number) => void;
  error: string | undefined;
}) {
  const blocked = line.open || line.max === 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-ink-primary font-mono text-sm font-semibold">{line.sku}</p>
        <p className="text-ink-tertiary text-xs tabular-nums">
          Đã giao {line.delivered} cái
          {line.unitsPerCarton ? ` (${line.unitsPerCarton} cái/thùng)` : ""}
          {line.claimed > 0 ? ` · ${line.claimed} cái đã yêu cầu trả` : ""}
          {line.printed ? " · In theo thiết kế" : ""}
        </p>
        {line.open ? (
          <p className="text-warning text-xs">Đang có yêu cầu trả hàng khác chưa xong.</p>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger text-xs">
            {error}
          </p>
        ) : null}
      </div>
      {blocked ? (
        <span className="text-ink-tertiary text-sm">Không trả thêm được</span>
      ) : (
        <QuantityStepper
          value={value}
          min={0}
          max={line.max}
          onChange={onChange}
          label={`Số lượng trả ${line.sku}`}
        />
      )}
    </li>
  );
}

/** Chọn hàng, lý do, mô tả và ảnh cho một yêu cầu trả hàng (kltn-docs 17 §4.10 bước 37–38). */
export function ReturnRequestForm({ lines, pending, error, onSubmit }: ReturnRequestFormProps) {
  const schema = useMemo(() => returnFormSchema(lines), [lines]);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReturnFormInput, unknown, ReturnFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      quantities: Object.fromEntries(lines.map((line) => [line.lineId, 0])),
      description: "",
      photos: [],
    },
  });
  const reasonCode = useWatch({ control, name: "reasonCode" });
  // `quantities` holds both its own message (nothing chosen) and one per line id.
  const quantityErrors = errors.quantities as
    ({ message?: string } & Record<string, { message?: string } | undefined>) | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <section className={CARD} aria-labelledby="return-lines-heading">
        <h2 id="return-lines-heading" className={HEADING}>
          1. Sản phẩm muốn trả
        </h2>
        <ul className="divide-border-default divide-y">
          {lines.map((line) => (
            <Controller
              key={line.lineId}
              control={control}
              name={`quantities.${line.lineId}`}
              render={({ field }) => (
                <LineRow
                  line={line}
                  value={field.value ?? 0}
                  onChange={field.onChange}
                  error={quantityErrors?.[line.lineId]?.message}
                />
              )}
            />
          ))}
        </ul>
        {typeof quantityErrors?.message === "string" ? (
          <p role="alert" className="text-danger text-sm">
            {quantityErrors.message}
          </p>
        ) : null}
      </section>

      <section className={CARD} aria-labelledby="return-reason-heading">
        <h2 id="return-reason-heading" className={HEADING}>
          2. Lý do
        </h2>
        <Controller
          control={control}
          name="reasonCode"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={field.onChange}
              aria-label="Lý do trả hàng"
              className="gap-1"
            >
              {CUSTOMER_RETURN_REASONS.map((reason) => (
                <Label
                  key={reason}
                  htmlFor={`return-reason-${reason}`}
                  className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm font-normal"
                >
                  <RadioGroupItem
                    id={`return-reason-${reason}`}
                    value={reason}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-ink-primary block">{RETURN_REASON_LABEL[reason]}</span>
                    <span className="text-ink-tertiary block text-xs">
                      {RETURN_REASON_HELP[reason]}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        {errors.reasonCode?.message ? (
          <p role="alert" className="text-danger text-sm">
            {errors.reasonCode.message}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="return-description" className="text-ink-primary text-sm font-medium">
            Mô tả vấn đề{reasonCode === "OTHER" ? " *" : " (không bắt buộc)"}
          </Label>
          <Textarea
            id="return-description"
            rows={4}
            maxLength={RETURN_DESCRIPTION_MAX}
            aria-invalid={!!errors.description}
            placeholder="Ví dụ: 20 cái trong thùng số 3 bị lem mực ở mặt sau."
            {...register("description")}
          />
          {errors.description?.message ? (
            <p role="alert" className="text-danger text-xs">
              {errors.description.message}
            </p>
          ) : null}
        </div>
      </section>

      <section className={CARD} aria-labelledby="return-photos-heading">
        <h2 id="return-photos-heading" className={HEADING}>
          3. Ảnh vấn đề
        </h2>
        <Controller
          control={control}
          name="photos"
          render={({ field }) => (
            <PhotoPicker
              files={field.value}
              onChange={field.onChange}
              max={RETURN_PHOTO_MAX_COUNT}
              maxBytes={RETURN_PHOTO_MAX_BYTES}
              accept={RETURN_PHOTO_TYPES}
              label="Ảnh chụp lỗi hoặc hư hỏng"
              hint="Sales duyệt dựa trên ảnh. JPEG, PNG hoặc WebP, mỗi ảnh tối đa 15 MB."
              disabled={pending}
              error={errors.photos?.message}
            />
          )}
        />
      </section>

      {error ? (
        <Alert tone="danger" title="Chưa gửi được yêu cầu">
          {error}
        </Alert>
      ) : null}
      <Alert tone="info" title="Sau khi gửi">
        Sales xem ảnh và quyết định trong giờ làm việc. Nếu được duyệt, bạn gửi số hàng được duyệt
        về kho trong 14 ngày, ghi số RMA trên kiện hàng. Giá trị hàng trả được trừ vào các đợt còn
        nợ; phần đã thanh toán được chuyển khoản lại.
      </Alert>
      <Button
        type="submit"
        className="min-h-11 w-full rounded-[var(--r-md)] sm:w-auto sm:px-8"
        disabled={pending}
      >
        {pending ? "Đang gửi..." : "Gửi yêu cầu trả hàng"}
      </Button>
    </form>
  );
}
