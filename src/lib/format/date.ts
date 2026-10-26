// Ported — same timezone, vi-VN format

const TZ = "Asia/Ho_Chi_Minh";

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: TZ }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: TZ,
  }).format(new Date(iso));
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
