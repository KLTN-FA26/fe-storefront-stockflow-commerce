// House format (SF-UX-3): dates dd/MM/yyyy and date-times dd/MM/yyyy HH:mm, in Vietnam time.
// ICU's vi-VN `dateStyle` gives "15 thg 12, 2026" (and puts the time first), so the parts are
// assembled here instead of trusting a locale style.

const TZ = "Asia/Ho_Chi_Minh";

type Part = "day" | "month" | "year" | "hour" | "minute";

function partsOf(date: Date, withTime: boolean): Record<Part, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    timeZone: TZ,
  }).formatToParts(date);
  const value = (type: Part) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: value("day"),
    month: value("month"),
    year: value("year"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

/** "15/12/2026". A plain `YYYY-MM-DD` is that calendar day; an instant is its day in Vietnam. */
export function formatDate(iso: string): string {
  const { day, month, year } = partsOf(new Date(iso), false);
  return `${day}/${month}/${year}`;
}

/** "15/12/2026 10:00", 24-hour clock, Vietnam time. */
export function formatDateTime(iso: string): string {
  const { day, month, year, hour, minute } = partsOf(new Date(iso), true);
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/** The calendar day (`YYYY-MM-DD`) an instant falls on in Vietnam. */
export function vnDayOf(date: Date): string {
  const { day, month, year } = partsOf(date, false);
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days in Vietnam from `now` until `iso`: 0 when it falls today, negative once the
 * day has passed. "Còn N ngày" counts days, not hours, so 23:59 tomorrow is still "còn 1 ngày".
 */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  return Math.round((day(vnDayOf(new Date(iso))) - day(vnDayOf(now))) / 86_400_000);
}

/** "còn 3 ngày", "hết hạn hôm nay", or null once the day has passed. */
export function daysLeftText(iso: string, now: Date = new Date()): string | null {
  const days = daysUntil(iso, now);
  if (days < 0) return null;
  return days === 0 ? "hết hạn hôm nay" : `còn ${days} ngày`;
}

/** Day and month ("25/10") in Vietnam time; ICU's separator for vi-VN varies, so it is set here. */
export function formatDayMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  }).formatToParts(date);
  const part = (type: "day" | "month") => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}`;
}

/** Hours and minutes ("10:32") in Vietnam time. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { timeStyle: "short", timeZone: TZ }).format(
    new Date(iso),
  );
}

export function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date();
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });
  const absDiff = Math.abs(diff);
  const sign = diff > 0 ? -1 : 1;
  if (absDiff < 60_000) return rtf.format(sign * Math.round(absDiff / 1000), "second");
  if (absDiff < 3_600_000) return rtf.format(sign * Math.round(absDiff / 60_000), "minute");
  if (absDiff < 86_400_000) return rtf.format(sign * Math.round(absDiff / 3_600_000), "hour");
  if (absDiff < 30 * 86_400_000) return rtf.format(sign * Math.round(absDiff / 86_400_000), "day");
  return formatDate(iso);
}
