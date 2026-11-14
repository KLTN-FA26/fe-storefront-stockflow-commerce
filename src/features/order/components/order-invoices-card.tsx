"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import {
  getMyEInvoiceFile,
  invoiceNumberText,
  invoiceStatusMeta,
  invoiceTypeLabel,
  useMyOrderEInvoices,
  type CustomerEInvoice,
  type EInvoiceFileKind,
} from "@/lib/einvoices";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import type { Order } from "../types";
import { ORDER_TONE_CLASSES } from "./order-status-badge";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";
export const EINVOICES_PERMISSION = "einvoices:READ";
/** Đã có lần giao thành công: hoá đơn của nó đang chờ Kế toán phát hành (docs 21 §4.1–4.2). */
const DELIVERED_STATES = new Set(["DELIVERED", "PARTIALLY_DELIVERED"]);

function InvoiceRow({ invoice }: { invoice: CustomerEInvoice }) {
  const [busy, setBusy] = useState<EInvoiceFileKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = invoiceStatusMeta(invoice);
  const open = async (kind: EInvoiceFileKind) => {
    setBusy(kind);
    setError(null);
    try {
      const link = await getMyEInvoiceFile(invoice.id, kind);
      window.open(link.url, "_blank", "noopener,noreferrer");
    } catch (failure: unknown) {
      setError(describeApiError(failure));
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="border-border-default space-y-2 rounded-[var(--r-md)] border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink-primary font-mono font-semibold tabular-nums">
            {invoiceNumberText(invoice)}
          </p>
          <p className="text-ink-secondary">
            {invoiceTypeLabel(invoice)} · {formatDate(invoice.issueDate)}
            {invoice.shipmentCode ? ` · ${invoice.shipmentCode}` : ""}
          </p>
        </div>
        <Badge
          className={cn(
            "h-7 shrink-0 rounded-full px-3 font-semibold",
            ORDER_TONE_CLASSES[meta.tone],
          )}
        >
          {meta.label}
        </Badge>
      </div>
      <p className="text-ink-primary font-semibold tabular-nums">
        Tổng có thuế: {formatMoney(invoice.grandTotal)}
      </p>
      <div className="flex gap-2">
        {(["PDF", "XML"] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            disabled={busy !== null}
            aria-label={`Tải ${kind} hoá đơn ${invoiceNumberText(invoice)}`}
            className="min-h-11 flex-1 rounded-[var(--r-md)]"
            onClick={() => void open(kind)}
          >
            <FileDown aria-hidden className="mr-1 size-4" /> {kind}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Hoá đơn điện tử của đơn (kltn-docs 21 §4.3 bước 9, §5.2): mỗi lần giao thành công một hoá đơn, kèm
 * hoá đơn điều chỉnh / thay thế; tải PDF (bản xem) và XML (bản có giá trị pháp lý). Đơn đã giao mà
 * chưa có hoá đơn: báo đang phát hành. Chỉ với tài khoản có `einvoices:READ`.
 */
export function OrderInvoicesCard({ order }: { order: Order }) {
  // Không hỏi gì khi danh sách quyền chưa về: tài khoản thiếu quyền không thấy thẻ nháy lên
  const permissions = useMyPermissions();
  const allowed = useHasPermission(EINVOICES_PERMISSION) && !permissions.isPending;
  const query = useMyOrderEInvoices(order.orderId, allowed);
  const delivered = DELIVERED_STATES.has(order.deliveryState ?? "");
  const invoices = query.data ?? [];
  if (!allowed || (!query.isPending && !query.error && invoices.length === 0 && !delivered))
    return null;

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
          Hoá đơn VAT của lần giao đang được phát hành và sẽ hiển thị tại đây.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Hoá đơn của đơn">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </ul>
      )}
    </section>
  );
}
