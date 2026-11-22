"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { getMyEInvoiceFile, invoiceNumberText, type EInvoiceFileKind } from "@/lib/einvoices";
import { formatDate } from "@/lib/format/date";

import { Button } from "@/components/ui/button";

import type { InvoiceCardPayload } from "../../card-payloads";
import { closedCardMeta } from "../../labels";
import type { ChatCard } from "../../types";
import { useOpenLink } from "../use-open-link";
import { CARD_LINK, CardFrame, Fact, Facts, cardMoney } from "./card-frame";

const FILES: { kind: EInvoiceFileKind; label: string }[] = [
  { kind: "PDF", label: "Tải hoá đơn (PDF)" },
  { kind: "XML", label: "Tải hoá đơn (XML)" },
];

/** INVOICE card (plan B.7.8): the issued e-invoice; each file opens through a short-lived link. */
export function InvoiceCard({ card, payload }: { card: ChatCard; payload: InvoiceCardPayload }) {
  const download = useOpenLink();
  const available = FILES.filter(({ kind }) => (kind === "PDF" ? payload.hasPdf : payload.hasXml));
  return (
    <CardFrame
      eyebrow="Hoá đơn điện tử"
      title={invoiceNumberText(payload)}
      status={closedCardMeta(card.state) ?? { label: "Đã phát hành", tone: "positive" }}
      footer={
        <>
          {available.map(({ kind, label }) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              disabled={download.busy !== null}
              onClick={() => download.open(kind, () => getMyEInvoiceFile(payload.id, kind))}
            >
              <FileDown aria-hidden className="size-4" />
              {download.busy === kind ? "Đang mở..." : label}
            </Button>
          ))}
          {payload.orderId ? (
            <Link href={STORE_ROUTES.account.orders.detail(payload.orderId)} className={CARD_LINK}>
              Xem đơn hàng
            </Link>
          ) : null}
        </>
      }
    >
      <Facts>
        {payload.orderNumber ? (
          <Fact label="Đơn hàng">
            <span className="font-mono">{payload.orderNumber}</span>
          </Fact>
        ) : null}
        {payload.issueDate ? (
          <Fact label="Ngày lập" numeric>
            {formatDate(payload.issueDate)}
          </Fact>
        ) : null}
        {payload.grandTotal !== null && payload.grandTotal !== undefined ? (
          <Fact label="Tổng thanh toán" numeric>
            {cardMoney(payload.grandTotal, payload.currency)}
          </Fact>
        ) : null}
      </Facts>
      {available.length === 0 ? (
        <p className="text-ink-secondary">Tệp hoá đơn đang được cập nhật.</p>
      ) : null}
      {download.error ? (
        <p role="alert" className="text-danger">
          {download.error}
        </p>
      ) : null}
      {download.fallback ? (
        <a href={download.fallback} target="_blank" rel="noopener noreferrer" className={CARD_LINK}>
          Mở file hoá đơn
        </a>
      ) : null}
    </CardFrame>
  );
}
