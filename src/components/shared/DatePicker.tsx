"use client";

import { useState, type Ref } from "react";
import { cn } from "cn";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { vi } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, vnDayOf } from "@/lib/format/date";

const ISO_DATE = "yyyy-MM-dd";
/** How far back and ahead the month / year dropdowns reach from this year. */
const YEAR_SPAN = { back: 2, ahead: 5 } as const;

interface DatePickerProps {
  /** `YYYY-MM-DD`, or "" when nothing is chosen: what `<input type="date">` held. */
  value: string;
  onChange: (value: string) => void;
  id?: string | undefined;
  /** Earliest / latest day that can be chosen (`YYYY-MM-DD`); other days are dimmed and inert. */
  min?: string | undefined;
  max?: string | undefined;
  placeholder?: string | undefined;
  /** Offers "Xoá ngày" back to "" — for an optional field. */
  clearable?: boolean | undefined;
  disabled?: boolean | undefined;
  onBlur?: () => void | undefined;
  ref?: Ref<HTMLButtonElement> | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  "aria-describedby"?: string | undefined;
}

/** `YYYY-MM-DD` as a local Date (no UTC shift of `new Date(iso)`); anything else is undefined. */
function toDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const date = parseISO(iso);
  return isValid(date) ? date : undefined;
}

/**
 * A day picker that reads and shows dd/MM/yyyy whatever the browser's locale (SF-UX-3): a field-like
 * button opening a calendar (month / year dropdowns, arrow keys move, Enter picks, Esc closes). The
 * native `<input type="date">` shows the browser's own order, so "12/07/2026" could mean 7 December.
 * No business rule here: the caller passes the limits.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Chọn ngày",
  clearable = false,
  className,
  onBlur,
  ...triggerProps
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const minDate = toDate(min);
  const maxDate = toDate(max);
  const today = vnDayOf(new Date());
  const year = Number(today.slice(0, 4));
  const todayOutOfRange = (min !== undefined && today < min) || (max !== undefined && today > max);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "border-input aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-11 w-full justify-between gap-2 rounded-[var(--r-md)] px-3 text-base font-normal tabular-nums aria-invalid:ring-3 md:text-sm",
            className,
            !selected && "text-ink-tertiary",
          )}
          {...triggerProps}
        >
          <span className="truncate">{selected ? formatDate(value) : placeholder}</span>
          <CalendarIcon aria-hidden className="text-ink-tertiary size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto gap-0 p-0">
        <Calendar
          mode="single"
          locale={vi}
          captionLayout="dropdown"
          // vi's short weekday names ("Th 2") overflow a cell; the narrow ones ("T2") fit.
          formatters={{ formatWeekdayName: (date) => format(date, "EEEEE", { locale: vi }) }}
          className="[--cell-size:--spacing(10)] sm:[--cell-size:--spacing(11)]"
          selected={selected}
          // The calendar's own "today" is the browser's day; min / max and "Hôm nay" use Vietnam's day.
          // Outside UTC+7 the two differ for part of the day, and the marked today would be disabled.
          today={toDate(today)}
          {...((selected ?? minDate) ? { defaultMonth: (selected ?? minDate) as Date } : {})}
          startMonth={new Date(year - YEAR_SPAN.back, 0)}
          endMonth={new Date(year + YEAR_SPAN.ahead, 11)}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          autoFocus
          onSelect={(date) => {
            if (date) commit(format(date, ISO_DATE));
            else if (clearable) commit("");
            else setOpen(false);
          }}
        />
        <div className="border-border-default flex items-center justify-between border-t p-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={todayOutOfRange}
            onClick={() => commit(today)}
          >
            Hôm nay
          </Button>
          {clearable ? (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={!selected}
              onClick={() => commit("")}
            >
              Xoá ngày
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
