"use client";

import { Info } from "lucide-react";

import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { invoiceNumberText, useMyOrderEInvoices } from "@/lib/einvoices";

import { invoiceConditions } from "../selectors";
import type { Order } from "../types";
import { InvoiceRow } from "./order-invoice-row";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";
export const EINVOICES_PERMISSION = "einvoices:READ";
/**
 * Đã có lần giao thành công: hoá đơn của nó đang được phát hành (docs 21 §4.1–4.2). Gồm cả đơn giữ
 * một phần hàng, phần còn lại về kho (`PARTIALLY_RETURNED`, WF-05 BE-35): hoá đơn của phần đã giao
 * vẫn phải hiện.
 */
const DELIVERED_STATES = new Set(["DELIVERED", "PARTIALLY_DELIVERED", "PARTIALLY_RETURNED"]);
/** Goods that never left (or a state the FE does not know): nothing to invoice yet. */
const NOT_GONE_OUT = new Set(["NOT_SHIPPED", "UNKNOWN", ""]);
/** A shipment that left the warehouse, delivered or not. */
const GONE_OUT_SHIPMENTS = new Set(["HANDED_OVER", "DELIVERED", "DELIVERY_FAILED", "RETURNED"]);

/**
 * The goods went out at least once: from then on the card says when invoices come. Before it (an
 * order still to sign or pay) the card and its long note are only noise (UI/UX 27/11, sf-07).
 */
function hasGoneOut(order: Pick<Order, "deliveryState" | "shipments">): boolean {
  return (
    !NOT_GONE_OUT.has(order.deliveryState ?? "") ||
    (order.shipments ?? []).some((shipment) => GONE_OUT_SHIPMENTS.has(shipment.status))
  );
}

/**
 * Hoá đơn điện tử của đơn (kltn-docs 21 §4.3 bước 9, §5.2): mỗi lần giao thành công một hoá đơn, kèm
 * hoá đơn điều chỉnh / thay thế; tải PDF (bản xem) và XML (bản có giá trị pháp lý). Đơn đã giao mà
 * chưa có hoá đơn: báo đang phát hành. Chỉ với tài khoản có `einvoices:READ`, và chỉ khi hàng đã
 * rời kho ít nhất một lần hoặc đơn đã có hoá đơn.
 */
export function OrderInvoicesCard({ order }: { order: Order }) {
  // Không hỏi gì khi danh sách quyền chưa về: tài khoản thiếu quyền không thấy thẻ nháy lên
  const permissions = useMyPermissions();
  const allowed = useHasPermission(EINVOICES_PERMISSION) && !permissions.isPending;
  const query = useMyOrderEInvoices(order.orderId, allowed);
  const delivered =
    DELIVERED_STATES.has(order.deliveryState ?? "") ||
    (order.shipments ?? []).some((shipment) => shipment.status === "DELIVERED");
  const invoices = query.data ?? [];
  // Link "thay thế" hiện số hoá đơn khách thấy trên dòng kia, không phải mã nội bộ `code` của BE
  const numbers = new Map(invoices.map((invoice) => [invoice.id, invoiceNumberText(invoice)]));
  const numberOf = (id: string) => numbers.get(id);
  // Until the order is completed, the card says when its invoices come (null once settled).
  const conditions = invoiceConditions(order);
  if (!allowed || (invoices.length === 0 && !hasGoneOut(order))) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-invoices-heading">
      <h2
        id="order-invoices-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Hoá đơn
      </h2>
      {query.isPending ? (
        <p className="text-ink-tertiary text-sm">Đang tải…</p>
      ) : query.error ? (
        <p role="alert" className="text-danger text-sm">
          {describeApiError(query.error)}
        </p>
      ) : invoices.length === 0 ? (
        <p className="text-ink-secondary text-sm">
          {delivered
            ? "Hoá đơn VAT của lần giao đang được phát hành và sẽ hiển thị tại đây."
            : "Chưa có hoá đơn."}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Hoá đơn của đơn">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} numberOf={numberOf} />
          ))}
        </ul>
      )}
      {conditions ? (
        <div className="bg-bg-subtle text-ink-secondary flex gap-2 rounded-[var(--r-md)] p-3 text-xs">
          <Info aria-hidden className="text-ink-tertiary mt-0.5 size-4 shrink-0" />
          <ul className="space-y-1" aria-label="Điều kiện xuất hoá đơn">
            {conditions.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
