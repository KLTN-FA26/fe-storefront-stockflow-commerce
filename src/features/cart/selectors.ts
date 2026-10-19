import { normalizeSku } from "@/lib/catalog/schemas";
import { availabilityBySku, indexBySku, unitPriceFor } from "@/lib/catalog/selectors";
import type { Availability, PriceSchedule, SkuAvailability } from "@/lib/catalog/types";
import type { CartLine } from "@/lib/store/use-cart-store";

/**
 * Why a line cannot be ordered as it is. Each one is something the BE refuses at POST /orders, so
 * the cart says so up front instead of letting the checkout fail:
 *  - OUT_OF_STOCK: ATP is 0 (INSUFFICIENT_STOCK);
 *  - NO_PRICE: no published selling price for the SKU (PRICE_NOT_AVAILABLE);
 *  - BELOW_MOQ: under the first tier of the customer's price list (CUSTOMER_PRICE_BELOW_MOQ);
 *  - PRICE_NOT_WHOLE: the BE takes whole VND only on a line.
 */
export type CartIssue = "OUT_OF_STOCK" | "NO_PRICE" | "BELOW_MOQ" | "PRICE_NOT_WHOLE";

export interface CartViewLine {
  line: CartLine;
  availability: Availability | undefined;
  schedule: PriceSchedule | undefined;
  unitPrice: number | undefined;
  lineTotal: number | undefined;
  issue: CartIssue | undefined;
}

export interface CartView {
  lines: CartViewLine[];
  /** Sum of the priced lines; an unpriced line adds nothing (and blocks the checkout). */
  subtotal: number;
  /** The BE total is the sum of the lines, so the cart total can be shown as is. */
  blocked: boolean;
}

function issueOf(
  availability: Availability | undefined,
  schedule: PriceSchedule | undefined,
  unitPrice: number | undefined,
  quantity: number,
): CartIssue | undefined {
  if (availability === "OUT_OF_STOCK") return "OUT_OF_STOCK";
  if (!schedule) return "NO_PRICE";
  if (quantity < schedule.moq) return "BELOW_MOQ";
  if (unitPrice === undefined) return "NO_PRICE";
  if (!Number.isInteger(unitPrice)) return "PRICE_NOT_WHOLE";
  return undefined;
}

/**
 * The cart with live prices and stock. A SKU is priced on the order's total of it (BE
 * `checkoutPrices`), which is the line's quantity because the cart keeps one line per SKU.
 */
export function buildCartView(
  lines: readonly CartLine[],
  schedules: readonly PriceSchedule[],
  availabilities: readonly SkuAvailability[],
): CartView {
  const scheduleBySku = indexBySku(schedules);
  const stockBySku = availabilityBySku(availabilities);
  const view = lines.map<CartViewLine>((line) => {
    const key = normalizeSku(line.sku);
    const schedule = scheduleBySku.get(key);
    const availability = stockBySku.get(key);
    const unitPrice = unitPriceFor(schedule, line.quantity);
    const issue = issueOf(availability, schedule, unitPrice, line.quantity);
    return {
      line,
      availability,
      schedule,
      unitPrice,
      lineTotal: unitPrice === undefined ? undefined : unitPrice * line.quantity,
      issue,
    };
  });
  return {
    lines: view,
    subtotal: view.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0),
    blocked: view.some((row) => row.issue !== undefined),
  };
}

export const ISSUE_MESSAGE: Record<CartIssue, (moq: number | undefined) => string> = {
  OUT_OF_STOCK: () => "Hết hàng. Hãy xoá sản phẩm này hoặc chọn phiên bản khác để đặt hàng.",
  NO_PRICE: () => "Chưa có giá cho sản phẩm này. Hãy chat với Sales để được báo giá.",
  BELOW_MOQ: (moq) => `Số lượng tối thiểu của bảng giá là ${moq ?? 1}.`,
  PRICE_NOT_WHOLE: () => "Giá của sản phẩm này chưa hợp lệ để đặt hàng. Hãy chat với Sales.",
};
