"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { getMyPaymentConfirmation } from "@/lib/documents";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { useMyInstallment, type Installment } from "@/lib/installments";

import { DocumentDownloadButton } from "./document-download-button";

/** The receipts that paid one installment, each with its payment confirmation (document 5c). */
function ReceiptList({ installment }: { installment: Installment }) {
  const query = useMyInstallment(installment.installmentId);
  if (query.isPending) return <p className="text-ink-tertiary text-sm">Đang tải…</p>;
  if (query.error && !query.data) {
    return (
      <p role="alert" className="text-danger-ink text-sm">
        {describeApiError(query.error)}
      </p>
    );
  }
  const receipts = (query.data?.receipts ?? []).filter((receipt) => receipt.status !== "VOIDED");
  if (receipts.length === 0) {
    return (
      <p className="text-ink-secondary text-sm">Chưa có khoản thanh toán nào được ghi nhận.</p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Các khoản đã thanh toán">
      {receipts.map((receipt) => (
        <li key={receipt.receiptId} className="bg-bg-subtle space-y-1 rounded-[var(--r-md)] p-3">
          <div className="flex justify-between gap-2 text-sm tabular-nums">
            <span className="text-ink-secondary">
              {formatDate(receipt.receivedOn)} ·{" "}
              <span className="font-mono">{receipt.reference}</span>
            </span>
            <span className="text-ink-primary font-medium">
              {formatMoney(receipt.amount, installment.currency)}
            </span>
          </div>
          <DocumentDownloadButton
            kind="paymentConfirmation"
            size="sm"
            label="Phiếu xác nhận thanh toán"
            ariaLabel={`Tải phiếu xác nhận thanh toán ${receipt.reference}`}
            load={() =>
              getMyPaymentConfirmation(
                installment.installmentId,
                receipt.receiptId,
                receipt.reference,
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * "Các lần đã thanh toán" of an installment that received money: opened on demand, then the
 * installment's receipts (GET /installments/me/{id}) and a payment confirmation for each. Nothing is
 * shown for an installment nothing was paid on.
 */
export function InstallmentReceipts({ installment }: { installment: Installment }) {
  const [open, setOpen] = useState(false);
  if (installment.paidAmount <= 0) return null;
  const panelId = `installment-receipts-${installment.installmentId}`;
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={panelId}
        className="text-accent min-h-11 w-full justify-between rounded-[var(--r-md)] px-3"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Ẩn các lần đã thanh toán" : "Các lần đã thanh toán và phiếu xác nhận"}
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open ? (
        <div id={panelId}>
          <ReceiptList installment={installment} />
        </div>
      ) : null}
    </div>
  );
}
