import { CART_QUANTITY_MAX, type CartLine } from "@/lib/store/use-cart-store";

import type { Order, OrderLine } from "./types";

/**
 * Reorder (SCRUM-190, owner decision REORDER 23/10):
 *  - an order bought at the price list is put back in the basket at TODAY's prices: the basket
 *    keeps only SKU and quantity and the cart reads price and stock live, so nothing of the old
 *    deal is carried over;
 *  - an order that came from a quote drafts a new quote for Sales (`allowedActions.reorder`);
 *  - design lines are never put in the basket (a design is quoted: SCRUM-490), and a SKU that is
 *    no longer on sale cannot be: both are skipped and named to the customer.
 */

/** How the order is ordered again, from what the BE says the customer may do with it. */
export type ReorderKind = "quote" | "basket";

export const reorderKindOf = (order: Order): ReorderKind =>
  order.allowedActions?.reorder === true ? "quote" : "basket";

export interface ReorderPlan {
  /** What goes in the basket, one line per SKU (a SKU on two order lines is added up). */
  lines: CartLine[];
  /** Printed to the customer's design: asked for as a quote, never put in the basket. */
  skippedDesign: OrderLine[];
  /** Stock goods whose SKU is no longer on sale. */
  skippedUnavailable: OrderLine[];
}

/**
 * Which lines of a price-list order go back in the basket. A line with `productSlug: null` is a SKU
 * the BE found no longer on sale; one with no such field (an older BE) cannot be refilled either,
 * and counts as unavailable here - the screen hides the button for such an order, see
 * {@link canRefillBasket}.
 */
export function planBasketReorder(order: Order): ReorderPlan {
  const bySku = new Map<string, CartLine>();
  const skippedDesign: OrderLine[] = [];
  const skippedUnavailable: OrderLine[] = [];
  for (const line of order.lines) {
    if (line.designSnapshotId) {
      skippedDesign.push(line);
    } else if (!line.productSlug || !line.productTitle) {
      skippedUnavailable.push(line);
    } else {
      const sku = line.sku.toUpperCase();
      const existing = bySku.get(sku);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + line.quantity, CART_QUANTITY_MAX);
      } else {
        bySku.set(sku, {
          sku,
          slug: line.productSlug,
          title: line.productTitle,
          ...(line.productImageUrl ? { imageUrl: line.productImageUrl } : {}),
          quantity: Math.min(line.quantity, CART_QUANTITY_MAX),
        });
      }
    }
  }
  return { lines: [...bySku.values()], skippedDesign, skippedUnavailable };
}

/**
 * False for an order from a BE that does not tell where its SKUs are on sale (no line carries the
 * field, not even as null): refilling would skip every line and blame the catalogue for it.
 */
export const canRefillBasket = (order: Order): boolean =>
  order.lines.length > 0 &&
  order.lines.some((line) => line.designSnapshotId || line.productSlug !== undefined);

/** "Ly giấy 8oz · CUP-8OZ × 1.000": how a skipped line is named in the notice. */
export const describeSkippedLine = (line: OrderLine): string =>
  `${line.productTitle ? `${line.productTitle} · ` : ""}${line.sku} × ${new Intl.NumberFormat("vi-VN").format(line.quantity)}`;
