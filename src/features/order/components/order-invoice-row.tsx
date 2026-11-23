"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { cn } from "cn";

import { DocumentDownloadButton } from "@/components/storefront/document-download-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMyEInvoiceAgreement } from "@/lib/documents";
import {
  describeEInvoiceError,
  errorNoticeStatusMeta,
  getMyEInvoiceFile,
  invoiceNumberText,
  invoiceStatusMeta,
  invoiceTypeLabel,
  useMyEInvoiceErrorNotices,
  type CustomerEInvoice,
  type EInvoiceFileKind,
  type EInvoiceReference,
} from "@/lib/einvoices";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { ORDER_TONE_CLASSES } from "./order-status-badge";

export const invoiceAnchor = (invoice: Pick<CustomerEInvoice, "id">) => `einvoice-${invoice.id}`;

const LINK =
  "text-accent focus-visible:ring-accent rounded-sm font-mono font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none";

/**
 * Liên kết tới một hoá đơn khác của đơn mà BE nêu (`replaces` / `replacedBy`). Hiện số hoá đơn
 * khách thấy trên dòng kia (`numberOf`); `code` của BE là mã nội bộ, chỉ dùng khi dòng kia không
 * có trong danh sách.
 */
function InvoiceLink({
  reference,
  numberOf,
}: {
  reference: EInvoiceReference;
  numberOf?: ((id: string) => string | undefined) | undefined;
}) {
  return (
    <a href={`#${invoiceAnchor(reference)}`} className={LINK}>
      {numberOf?.(reference.id) ?? reference.code}
    </a>
  );
}

/**
 * Thông báo hoá đơn ghi sai tên / địa chỉ (Mẫu 04/SS-HĐĐT, TT 91/2026 Điều 10 khoản 1a; SF-03): hoá
 * đơn giữ nguyên giá trị, đây là thông tin đúng. Trạng thái chỉ nói "đã gửi cơ quan thuế" khi BE ghi
 * như vậy (`errorNoticeStatusMeta`). Không có thông báo: không hiện gì.
 */
function InvoiceErrorNotices({ invoiceId }: { invoiceId: string }) {
  const query = useMyEInvoiceErrorNotices(invoiceId);
  if (query.isError) {
    return (
      <p className="text-ink-tertiary flex flex-wrap items-center gap-x-2 text-xs">
        Chưa tải được thông báo sai sót của hoá đơn này.
        <button
          type="button"
          className="text-accent focus-visible:ring-accent min-h-11 rounded-sm font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Thử lại
        </button>
      </p>
    );
  }
  const notices = query.data ?? [];
  if (notices.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Thông báo sai sót của hoá đơn">
      {notices.map((notice) => {
        const meta = errorNoticeStatusMeta(notice);
        return (
          <li key={notice.id} className="bg-bg-subtle space-y-1 rounded-[var(--r-md)] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink-primary font-medium">
                Thông báo sai sót {notice.formName ?? "04/SS-HĐĐT"}
              </p>
              <Badge
                className={cn(
                  "h-7 shrink-0 rounded-full px-3 font-semibold",
                  ORDER_TONE_CLASSES[meta.tone],
                )}
              >
                {meta.label}
              </Badge>
            </div>
            <p className="text-ink-secondary">
              {notice.correctBuyerName || notice.correctBuyerAddress
                ? "Hoá đơn ghi sai thông tin người mua nhưng vẫn giữ nguyên giá trị; thông tin đúng là:"
                : "Hoá đơn ghi sai thông tin người mua nhưng vẫn giữ nguyên giá trị."}
            </p>
            {notice.correctBuyerName ? (
              <p className="text-ink-primary">Tên người mua: {notice.correctBuyerName}</p>
            ) : null}
            {notice.correctBuyerAddress ? (
              <p className="text-ink-primary">Địa chỉ: {notice.correctBuyerAddress}</p>
            ) : null}
            {notice.reason ? (
              <p className="text-ink-secondary whitespace-pre-line">{notice.reason}</p>
            ) : null}
            {notice.recordedAt ? (
              <p className="text-ink-tertiary text-xs tabular-nums">
                Ghi nhận lúc {formatDateTime(notice.recordedAt)}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Một hoá đơn của đơn: số, loại, ngày, trạng thái, tải PDF / XML. Hoá đơn "Đã bị thay thế" chỉ tới
 * hoá đơn đã thay nó (`replacedBy`), hoá đơn thay thế chỉ về hoá đơn nó thay (`replaces`) — BE nêu
 * từng mắt xích, không suy đoán.
 */
export function InvoiceRow({
  invoice,
  numberOf,
}: {
  invoice: CustomerEInvoice;
  /** Số hiển thị của một hoá đơn khác cùng đơn, theo id (undefined khi không có trong danh sách). */
  numberOf?: ((id: string) => string | undefined) | undefined;
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
      setError(describeEInvoiceError(failure));
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
        Tổng có VAT: {formatMoney(invoice.grandTotal)}
      </p>
      {invoice.replaces ? (
        <p className="text-ink-secondary">
          Thay thế cho <InvoiceLink reference={invoice.replaces} numberOf={numberOf} />.
        </p>
      ) : null}
      {invoice.status === "REPLACED" ? (
        <p className="text-ink-secondary">
          {invoice.replacedBy ? (
            <>
              Đã được thay thế bởi{" "}
              <InvoiceLink reference={invoice.replacedBy} numberOf={numberOf} />. Hoá đơn thay thế
              là hoá đơn có hiệu lực.
            </>
          ) : (
            "Hoá đơn này đã được thay thế; hoá đơn thay thế là hoá đơn có hiệu lực."
          )}
        </p>
      ) : null}
      <InvoiceErrorNotices invoiceId={invoice.id} />
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
      {invoice.type === "ADJUSTMENT" || invoice.type === "REPLACEMENT" ? (
        // The agreement both companies sign for this correction (documents/endpoints.md 7c).
        <DocumentDownloadButton
          kind="einvoiceAgreement"
          className="w-full"
          label="Tải biên bản thỏa thuận"
          ariaLabel={`Tải biên bản thỏa thuận ${invoiceTypeLabel(invoice).toLowerCase()} ${invoiceNumberText(invoice)}`}
          load={() => getMyEInvoiceAgreement(invoice.id, invoiceNumberText(invoice))}
        />
      ) : null}
    </li>
  );
}
