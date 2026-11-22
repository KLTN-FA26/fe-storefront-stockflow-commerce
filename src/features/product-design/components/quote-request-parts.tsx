"use client";

import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { DatePicker } from "@/components/shared/DatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/cn";
import type { SemanticTone } from "@/lib/domain/types";
import { formatDate, formatNumber } from "@/lib/format";

import { MAX_QUOTE_CARTONS, vnToday } from "../quote-request-rules";
import type {
  DesignQuoteRequest,
  QuoteRequestFormValues,
  QuoteRequestInput,
  QuoteRequestStatus,
} from "../types";
import { BADGE, TONE_CLASSES } from "./design-status-badge";

// What every quote-request screen shares: the status badge, the two fields of an ask, how a
// request's facts read, and the notice once it is sent.

/** OPEN waits for the sales staff (info); CLOSED was dropped (muted), or answered (below). */
const STATUS_META: Record<QuoteRequestStatus, { label: string; tone: SemanticTone }> = {
  OPEN: { label: "Đang chờ báo giá", tone: "info" },
  CLOSED: { label: "Đã đóng", tone: "muted" },
};
const QUOTED_META = { label: "Đã có báo giá", tone: "positive" } as const;

/** What a request's closing says about it (R5-5): the fields the BE may not send yet. */
type ClosedOutcome = Pick<
  DesignQuoteRequest,
  "status" | "closedOutcome" | "quoteId" | "quoteNumber"
>;

/** The quote that answered a closed request, when the BE names it; null otherwise. */
export function answeringQuote(request: ClosedOutcome): { id: string; number: string } | null {
  if (request.status !== "CLOSED" || request.closedOutcome !== "QUOTED" || !request.quoteId) {
    return null;
  }
  return { id: request.quoteId, number: request.quoteNumber?.trim() || "" };
}

/** "Đang chờ báo giá", "Đã có báo giá" once answered with a named quote, else "Đã đóng". */
export function QuoteRequestStatusBadge({ request }: { request: ClosedOutcome }) {
  const { label, tone } = answeringQuote(request) ? QUOTED_META : STATUS_META[request.status];
  return (
    <Badge data-tone={tone} className={cn(BADGE, TONE_CLASSES[tone])}>
      {label}
    </Badge>
  );
}

/**
 * "QT-… → Xem báo giá" beside the "Đã có báo giá" badge of a request Sales answered (SF-UX-10): a
 * closed request read alone looks refused. Nothing when the BE does not name the quote.
 */
export function AnsweringQuoteLink({ request }: { request: ClosedOutcome }) {
  const quote = answeringQuote(request);
  if (!quote) return null;
  return (
    <p className="text-ink-secondary flex flex-wrap items-center gap-x-2 text-sm">
      {quote.number ? <span className="text-ink-primary font-mono">{quote.number}</span> : null}
      <Link
        href={STORE_ROUTES.account.quotes.detail(quote.id)}
        className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        Xem báo giá
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </p>
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

/** The whole number of cartons typed, or null while it is not one. */
const typedCartons = (text: string | undefined) => {
  const value = text?.trim() ?? "";
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
};

/**
 * "1 thùng = 1.000 cái", and "50 thùng = 50.000 cái" for what is typed (SF-UX-9): a buyer thinks in
 * pieces, the request counts cartons. Nothing without the variant's carton spec.
 */
export function CartonsInPieces({
  id,
  unitsPerCarton,
  cartons,
}: {
  id: string;
  unitsPerCarton: number | null | undefined;
  cartons: string | undefined;
}) {
  if (!unitsPerCarton) return null;
  const typed = typedCartons(cartons);
  return (
    <p id={id} aria-live="polite" className="text-ink-secondary text-xs tabular-nums">
      {`1 thùng = ${formatNumber(unitsPerCarton)} cái`}
      {typed ? ` · ${cartonsLabel(typed)} = ${formatNumber(typed * unitsPerCarton)} cái` : null}
    </p>
  );
}

/**
 * "Số thùng mong muốn" (a whole number, 1 to 1,000,000, only a suggestion: 14 BR-22) and "Ngày giao
 * mong muốn" (optional, not before today in Vietnam). `idPrefix` keeps two forms on a page apart.
 */
export function QuoteRequestFields({
  register,
  control,
  errors,
  idPrefix,
  disabled = false,
  unitsPerCarton,
  cartons,
}: {
  register: UseFormRegister<QuoteRequestFormValues>;
  /** The date is a dd/MM/yyyy picker (SF-UX-3), a controlled field. */
  control: Control<QuoteRequestFormValues, unknown, QuoteRequestInput>;
  errors: FieldErrors<QuoteRequestFormValues>;
  idPrefix: string;
  disabled?: boolean;
  /** The design's carton spec, when known: shown as pieces under the cartons (SF-UX-9). */
  unitsPerCarton?: number | null | undefined;
  /** The cartons as typed, for the live count of pieces. */
  cartons?: string | undefined;
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
          aria-describedby={
            unitsPerCarton
              ? `${cartonsId}-pieces ${described(cartonsId, cartonsError)}`
              : described(cartonsId, cartonsError)
          }
          {...register("cartons")}
        />
        <CartonsInPieces
          id={`${cartonsId}-pieces`}
          unitsPerCarton={unitsPerCarton}
          cartons={cartons}
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
        <Controller
          control={control}
          name="desiredDeliveryDate"
          render={({ field }) => (
            <DatePicker
              id={dateId}
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              min={vnToday()}
              clearable
              disabled={disabled}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={described(dateId, dateError)}
            />
          )}
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
 * changed ("Đã cập nhật yêu cầu"); "Chat với Sale" opens the conversation about `chat` (the design or the
 * project the request is for), where the BE posts the request's card (16 §4.2).
 */
export function QuoteRequestSent({
  updated,
  chat,
}: {
  updated: boolean;
  chat: { kind: "DESIGN" | "DESIGN_PROJECT"; id: string };
}) {
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
        <Link href={STORE_ROUTES.chat.about(chat.kind, chat.id)}>
          <MessageCircle aria-hidden className="size-4" />
          {CHAT_WITH_SALES}
        </Link>
      </Button>
    </div>
  );
}
