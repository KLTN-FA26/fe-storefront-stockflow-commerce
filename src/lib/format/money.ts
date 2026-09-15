// Ported from stockflow-ui/src/lib/format/money.ts — same

import type { Currency } from "@/lib/domain/types";

export function formatMoney(amount: number, currency: Currency = "VND"): string {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "VND" ? 0 : 2,
  }).format(amount);
}

export function formatCompact(amount: number, currency: Currency = "VND"): string {
  if (currency !== "VND") return formatMoney(amount, currency);
  if (amount >= 1_000_000_000)
    return `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ ₫`;
  if (amount >= 1_000_000)
    return `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr ₫`;
  return formatMoney(amount, currency);
}

export function formatVND(amount: number): string {
  return formatMoney(amount, "VND");
}
