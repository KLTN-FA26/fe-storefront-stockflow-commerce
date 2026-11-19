"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import {
  getMyEInvoiceFile,
  invoiceNumberText,
  invoiceStatusMeta,
  invoiceTypeLabel,
  type CustomerEInvoice,
  type EInvoiceFileKind,
} from "@/lib/einvoices";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { ORDER_TONE_CLASSES } from "./order-status-badge";

export const invoiceAnchor = (invoice: Pick<CustomerEInvoice, "id">) => `einvoice-${invoice.id}`;

/**
 * Một hoá đơn của đơn: số, loại, ngày, trạng thái, tải PDF / XML. Hoá đơn "Đã bị thay thế" chỉ tới
 * hoá đơn thay thế nó (`replacement`) trong cùng danh sách.
 */
export function InvoiceRow({
  invoice,
  replacement,
}: {
  invoice: CustomerEInvoice;
  replacement: CustomerEInvoice | undefined;
}) {
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
    <li
      id={invoiceAnchor(invoice)}
      className="border-border-default scroll-mt-[var(--sticky-top)] space-y-2 rounded-[var(--r-md)] border p-3 text-sm"
    >
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
      {invoice.status === "REPLACED" ? (
        <p className="text-ink-secondary">
          {replacement ? (
            <>
              Đã được thay thế bởi{" "}
              <a
                href={`#${invoiceAnchor(replacement)}`}
                className="text-accent focus-visible:ring-accent rounded-sm font-mono font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {invoiceNumberText(replacement)}
              </a>
              . Hoá đơn thay thế là hoá đơn có hiệu lực.
            </>
          ) : (
            "Hoá đơn này đã được thay thế; hoá đơn thay thế là hoá đơn có hiệu lực."
          )}
        </p>
      ) : null}
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
