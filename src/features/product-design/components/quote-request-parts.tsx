"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { FieldErrors, UseFormRegister } from "react-hook-form";

import { STORE_ROUTES } from "@/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";
import { formatDate, formatNumber } from "@/lib/format";

import { MAX_QUOTE_CARTONS, vnToday } from "../quote-request-rules";
import type { QuoteRequestFormValues, QuoteRequestStatus } from "../types";
import { BADGE, TONE_CLASSES } from "./design-status-badge";

// What every quote-request screen shares: the status badge, the two fields of an ask, how a
// request's facts read, and the notice once it is sent.

/** OPEN waits for the sales staff (info); CLOSED was answered or dropped (muted). */
const STATUS_META: Record<QuoteRequestStatus, { label: string; tone: SemanticTone }> = {
  OPEN: { label: "Đang chờ báo giá", tone: "info" },
  CLOSED: { label: "Đã đóng", tone: "muted" },
};

export function QuoteRequestStatusBadge({ status }: { status: QuoteRequestStatus }) {
  const { label, tone } = STATUS_META[status];
  return (
    <Badge data-tone={tone} className={cn(BADGE, TONE_CLASSES[tone])}>
      {label}
    </Badge>
  );
}

/** "120 thùng". */
export const cartonsLabel = (cartons: number) => `${formatNumber(cartons)} thùng`;

/** A `yyyy-MM-dd` as the customer reads it (Asia/Ho_Chi_Minh); "Chưa chọn" without one. */
export const desiredDateLabel = (date: string | null | undefined) =>
  date ? formatDate(date) : "Chưa chọn";

export const FIELD_ERROR = "text-danger text-sm";
export const DIALOG_CONTENT =
  "bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0";
export const ACTION_BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

/** The date input's own error, or the hint under it. */
function described(id: string, error: string | undefined) {
  return error ? `${id}-hint ${id}-error` : `${id}-hint`;
}

/**
 * "Số thùng mong muốn" (a whole number, 1 to 1,000,000, only a suggestion: 14 BR-22) and "Ngày giao
 * mong muốn" (optional, not before today in Vietnam). `idPrefix` keeps two forms on a page apart.
 */
export function QuoteRequestFields({
  register,
  errors,
  idPrefix,
  disabled = false,
}: {
  register: UseFormRegister<QuoteRequestFormValues>;
  errors: FieldErrors<QuoteRequestFormValues>;
  idPrefix: string;
  disabled?: boolean;
}) {
  const cartonsId = `${idPrefix}-cartons`;
  const dateId = `${idPrefix}-date`;
  const cartonsError = errors.cartons?.message;
  const dateError = errors.desiredDeliveryDate?.message;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={cartonsId}>Số thùng mong muốn</Label>
        <Input
          id={cartonsId}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_QUOTE_CARTONS}
          step={1}
          className="min-h-11 tabular-nums"
          disabled={disabled}
          aria-invalid={cartonsError ? true : undefined}
          aria-describedby={described(cartonsId, cartonsError)}
          {...register("cartons")}
        />
        <p id={`${cartonsId}-hint`} className="text-ink-tertiary text-xs">
          Chỉ là gợi ý: Sale sẽ đề xuất số thùng và giá trong báo giá.
        </p>
        {cartonsError ? (
          <p id={`${cartonsId}-error`} role="alert" className={FIELD_ERROR}>
            {cartonsError}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor={dateId}>Ngày giao mong muốn (không bắt buộc)</Label>
        <Input
          id={dateId}
          type="date"
          min={vnToday()}
          className="min-h-11 tabular-nums"
          disabled={disabled}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={described(dateId, dateError)}
          {...register("desiredDeliveryDate")}
        />
        <p id={`${dateId}-hint`} className="text-ink-tertiary text-xs">
          Từ hôm nay trở đi. Sale chép ngày này vào báo giá.
        </p>
        {dateError ? (
          <p id={`${dateId}-error`} role="alert" className={FIELD_ERROR}>
            {dateError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The ask went through: a new request ("Đã gửi yêu cầu, Sale sẽ liên hệ qua chat"), or the open one
 * changed ("Đã cập nhật yêu cầu"); "Mở chat" opens the conversations, where the BE posts the
 * request's card (16 §4.2).
 */
export function QuoteRequestSent({ updated }: { updated: boolean }) {
  return (
    <div className="grid gap-3">
      <div
        role="status"
        className="bg-positive/10 text-positive border-positive/30 flex gap-2.5 rounded-[var(--r-md)] border px-3.5 py-2.5 text-sm"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="text-ink-primary">
            {updated ? "Đã cập nhật yêu cầu." : "Đã gửi yêu cầu, Sale sẽ liên hệ qua chat."}
          </strong>{" "}
          {updated
            ? "Sale nhận số thùng và ngày giao mới trong cùng cuộc trò chuyện."
            : "Yêu cầu báo giá đã được gắn vào cuộc trò chuyện với Sale."}
        </p>
      </div>
      <Button asChild variant="outline" className={cn(ACTION_BUTTON, "justify-self-start")}>
        <Link href={STORE_ROUTES.chat.list}>
          <MessageCircle aria-hidden className="size-4" />
          Mở chat
        </Link>
      </Button>
    </div>
  );
}
