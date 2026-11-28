// Ported

export function formatNumber(n: number): string {
  return n.toLocaleString("vi-VN");
}

export function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(n);
}

const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const; // index 0 is unused: a size starts at KB

/**
 * A file size for people: binary steps (1 KB = 1024 B), one decimal at most, Vietnamese comma. Never bare bytes: a small
 * file reads "0,8 KB", not "774 B", which only a technician knows (S04-5).
 */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes) / 1024;
  let unit = 1;
  while (value >= 1024 && unit < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  return `${number.format(value)} ${FILE_SIZE_UNITS[unit]}`;
}

export function formatPercent(n: number, decimals = 1): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}
