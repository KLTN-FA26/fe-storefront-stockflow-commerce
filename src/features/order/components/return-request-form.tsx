"use client";

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
  type ReturnableShipment,
} from "@/lib/returns";

import {
  RETURN_REASON_HELP,
  quantitiesFor,
  returnFormSchema,
  type ReturnFormInput,
  type ReturnFormValues,
  type ReturnableLine,
} from "../return-form";
import { ReturnShipmentPicker } from "./return-shipment-picker";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)] space-y-4";
const HEADING = "font-display text-ink-primary text-base font-semibold";

interface ReturnRequestFormProps {
  /** What is left to return of each line, for the delivery chosen (undefined: none chosen yet). */
  linesOf: (shipmentId: string | undefined) => readonly ReturnableLine[];
  /** The delivered shipments (WF-05 TH-1); empty for an order returned as a whole. */
  shipments: readonly ReturnableShipment[];
  /** Delivered in several shipments: the customer names the one the goods came on. */
  needsChoice: boolean;
  defaultShipmentId: string | undefined;
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
export function ReturnRequestForm({
  linesOf,
  shipments,
  needsChoice,
  defaultShipmentId,
  pending,
  error,
  onSubmit,
}: ReturnRequestFormProps) {
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ReturnFormInput, unknown, ReturnFormValues>({
    // The resolver is read on every render, so it follows the shipment chosen below.
    resolver: (values, context, options) => zodResolver(schema)(values, context, options),
    defaultValues: {
      shipmentId: defaultShipmentId,
      quantities: quantitiesFor(linesOf(defaultShipmentId)),
      description: "",
      photos: [],
    },
  });
  const reasonCode = useWatch({ control, name: "reasonCode" });
  const shipmentId: string | undefined = useWatch({ control, name: "shipmentId" });
  // The React Compiler memoizes these; the annotations break the type cycle with the resolver.
  const lines: readonly ReturnableLine[] = linesOf(shipmentId);
  const schema: ReturnType<typeof returnFormSchema> = returnFormSchema(lines, {
    shipments,
    needsChoice,
  });
  const choosing = needsChoice && !shipmentId;
  // BE sends what the chosen delivery carried: the limits are that delivery's own.
  const perShipment = shipments.some(
    (shipment) => (shipment.shipmentId ?? "") === (shipmentId ?? "") && shipment.lines,
  );
  // Another delivery offers other lines and other limits: keep what still fits, drop the rest.
  const refitQuantities = (next: string) =>
    setValue("quantities", quantitiesFor(linesOf(next), getValues("quantities")));
  // Step numbers shift by one when the delivery is chosen first.
  const step = (n: number) => (needsChoice ? n + 1 : n);
  // `quantities` holds both its own message (nothing chosen) and one per line id. The resolver
  // files the own message under `root` when a line id starts with a digit (it reads that as an
  // array index), so both places are read.
  const quantityErrors = errors.quantities as
    ({ message?: string } & Record<string, { message?: string } | undefined>) | undefined;
  const nothingChosen = quantityErrors?.message ?? quantityErrors?.root?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {needsChoice ? (
        <section className={CARD} aria-labelledby="return-shipment-heading">
          <h2 id="return-shipment-heading" className={HEADING}>
            1. Lần giao có hàng muốn trả
          </h2>
          <p className="text-ink-secondary text-sm">
            Đơn được giao làm nhiều lần. Mỗi yêu cầu trả hàng dành cho một lần giao; hạn đổi / trả
            tính từ ngày giao của lần đó.
          </p>
          <Controller
            control={control}
            name="shipmentId"
            render={({ field }) => (
              <ReturnShipmentPicker
                shipments={shipments}
                value={field.value}
                onChange={(next) => {
                  field.onChange(next);
                  refitQuantities(next);
                }}
                error={errors.shipmentId?.message}
                disabled={pending}
              />
            )}
          />
        </section>
      ) : null}
      <section className={CARD} aria-labelledby="return-lines-heading">
        <h2 id="return-lines-heading" className={HEADING}>
          {step(1)}. Sản phẩm muốn trả
        </h2>
        {choosing ? (
          <p className="text-ink-secondary text-sm">Chọn lần giao ở trên để chọn sản phẩm.</p>
        ) : (
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
        )}
        {!choosing && perShipment ? (
          <p className="text-ink-tertiary text-xs">
            Số lượng tối đa tính theo lần giao đã chọn: số hàng lần giao đó mang tới, trừ phần đã
            yêu cầu trả.
          </p>
        ) : needsChoice && !choosing ? (
          <p className="text-ink-tertiary text-xs">
            Chỉ trả số hàng đã nhận trong lần giao đã chọn.
          </p>
        ) : null}
        {typeof nothingChosen === "string" ? (
          <p role="alert" className="text-danger text-sm">
            {nothingChosen}
          </p>
        ) : null}
      </section>

      <section className={CARD} aria-labelledby="return-reason-heading">
        <h2 id="return-reason-heading" className={HEADING}>
          {step(2)}. Lý do
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
          {step(3)}. Ảnh vấn đề
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
              hint="Sale duyệt dựa trên ảnh. JPEG, PNG hoặc WebP, mỗi ảnh tối đa 15 MB."
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
        Sale xem ảnh và quyết định trong giờ làm việc. Nếu được duyệt, bạn gửi số hàng được duyệt về
        kho trong 14 ngày, ghi số RMA trên kiện hàng. Giá trị hàng trả được trừ vào các đợt còn nợ;
        phần đã thanh toán được chuyển khoản lại.
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
