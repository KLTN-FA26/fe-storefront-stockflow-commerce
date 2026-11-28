import type { PrintAreaCode } from "../../engine";

/**
 * Name of a print face for the customer: the template's own name, or "Mặt 2" (its place in the order) when the template
 * does not name it — never the internal code (UX audit S08-13). Shared by the face switcher and "Sao chép sang mặt".
 */
export function faceName(
  printAreas: readonly { code: PrintAreaCode; name?: string | null }[],
  order: readonly PrintAreaCode[],
  code: PrintAreaCode,
): string {
  return printAreas.find((area) => area.code === code)?.name ?? `Mặt ${order.indexOf(code) + 1}`;
}
