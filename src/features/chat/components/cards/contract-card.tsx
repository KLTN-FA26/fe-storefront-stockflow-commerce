"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";
import { installmentName } from "@/lib/installments";

import { Button } from "@/components/ui/button";

import { getContractDocumentLink } from "../../api";
import type { ContractCardPayload } from "../../card-payloads";
import { SIGNED_COPY_SENT, contractStatusMeta, milestoneLabel } from "../../labels";
import { useOpenLink } from "../use-open-link";
import { CARD_LINK, CardFrame, Fact, Facts, cardMoney } from "./card-frame";

interface ContractCardProps {
  payload: ContractCardPayload;
  /** When the customer last sent a PDF or image after this card, while it waits for the signature (SF-UX-24). */
  signedCopyAt?: string | null | undefined;
}

/**
 * CONTRACT card: signing happens on the order page with email OTP or a signed PDF upload.
 * Older chat attachments remain acknowledged for contracts that still await signing. A CANCELLED
 * contract (WF-02 FE-8, Q-12) offers no download: the link fetches the order's live contract, so an
 * old card would hand out the redrawn one, or nothing to sign. Nor "Xem đơn hàng" (owner decision
 * 15): while Sale redraws the contract the order is back in DRAFT and its page answers 404.
 */
export function ContractCard({ payload, signedCopyAt }: ContractCardProps) {
  const download = useOpenLink();
  const waiting = payload.status === "SENT";
  const cancelled = payload.status === "CANCELLED";
  const sentCopy = waiting && signedCopyAt ? signedCopyAt : null;
  return (
    <CardFrame
      eyebrow="Hợp đồng mua bán"
      title={payload.number}
      status={sentCopy ? SIGNED_COPY_SENT : contractStatusMeta(payload.status)}
      footer={
        cancelled ? null : (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              disabled={download.busy !== null}
              onClick={() =>
                download.open("contract", () =>
                  getContractDocumentLink(payload.documentPath, payload.orderId),
                )
              }
            >
              <FileDown aria-hidden className="size-4" />
              {download.busy ? "Đang mở..." : "Tải hợp đồng"}
            </Button>
            <Link
              href={`${STORE_ROUTES.account.orders.detail(payload.orderId)}#hop-dong`}
              className={CARD_LINK}
            >
              {waiting ? "Ký hợp đồng trên cổng" : "Xem đơn hàng"}
            </Link>
          </>
        )
      }
    >
      <Facts>
        {payload.orderNumber ? (
          <Fact label="Đơn hàng" numeric>
            <span className="font-mono">{payload.orderNumber}</span>
          </Fact>
        ) : null}
        {payload.totalAmount !== null && payload.totalAmount !== undefined ? (
          <Fact label="Tổng giá trị" numeric>
            {cardMoney(payload.totalAmount, payload.currency)}
          </Fact>
        ) : null}
        {payload.signedOn ? (
          <Fact label="Ngày ký" numeric>
            {formatDate(payload.signedOn)}
          </Fact>
        ) : null}
        {payload.freeSampleRounds ? (
          <Fact label="In mẫu miễn phí" numeric>
            {formatNumber(payload.freeSampleRounds)} lần
          </Fact>
        ) : null}
      </Facts>
      {payload.paymentPlan.length > 0 ? (
        <div className="space-y-1.5">
          <h4 className="text-ink-primary font-semibold">Lịch thanh toán</h4>
          <ol className="divide-border-default border-border-default divide-y rounded-[var(--r-md)] border">
            {payload.paymentPlan.map((installment) => (
              <li key={installment.seq} className="flex items-start justify-between gap-3 p-2.5">
                <div className="min-w-0">
                  <p className="text-ink-primary font-medium">
                    Đợt {installment.seq} · {installmentName(installment.name)}
                  </p>
                  <p className="text-ink-secondary">
                    {milestoneLabel(installment.milestone)}
                    {installment.dueDays ? `, trong ${installment.dueDays} ngày` : ""}
                  </p>
                </div>
                <p className="text-ink-primary shrink-0 text-right font-semibold tabular-nums">
                  {cardMoney(installment.amount, payload.currency)}
                  {installment.percent ? (
                    <span className="text-ink-tertiary block text-xs font-normal">
                      {formatNumber(installment.percent)}%
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {sentCopy ? (
        <p role="status" className="text-ink-primary">
          Đã gửi bản ký lúc <span className="tabular-nums">{formatDateTime(sentCopy)}</span> · chờ
          Sale xác nhận.
        </p>
      ) : waiting ? (
        <p className="text-ink-secondary">
          Mở hợp đồng trên trang đơn hàng để đọc và ký bằng mã xác thực email, hoặc tải lên bản đã
          ký.
        </p>
      ) : cancelled ? (
        <p className="text-ink-secondary">
          Hợp đồng này đã huỷ, không dùng để ký. Nếu Sale lập lại hợp đồng, bạn sẽ nhận bản mới
          trong cuộc trò chuyện này.
        </p>
      ) : null}
      {download.error ? (
        <p role="alert" className="text-danger">
          {download.error}
        </p>
      ) : null}
      {download.fallback && !cancelled ? (
        <a href={download.fallback} target="_blank" rel="noopener noreferrer" className={CARD_LINK}>
          Mở file hợp đồng
        </a>
      ) : null}
    </CardFrame>
  );
}
