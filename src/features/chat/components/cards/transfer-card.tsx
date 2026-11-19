import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import type { InstallmentTransfer } from "@/lib/installments";

import { Alert } from "@/components/shared";
import { TransferInstructionsBlock } from "@/components/storefront/transfer-instructions";

import type { TransferCardPayload } from "../../card-payloads";
import { installmentStatusMeta } from "../../labels";
import { CARD_LINK, CardFrame, Fact, Facts, cardMoney } from "./card-frame";
import { VietQrCode } from "./viet-qr-code";

const SETTLED = new Set(["PAID", "CANCELLED"]);

function asTransfer(payload: TransferCardPayload): InstallmentTransfer | null {
  if (!payload.bank) return null;
  return {
    installmentId: payload.installmentId,
    contractNumber: payload.contractNumber ?? "",
    orderNumber: payload.orderNumber ?? "",
    seq: payload.seq ?? 1,
    name: payload.name ?? "",
    bankName: payload.bank.bankName,
    accountNumber: payload.bank.accountNumber,
    accountName: payload.bank.accountName,
    // What the instalment STILL owes (plan B.7.5 `amount`), not its full amount.
    amountDue: payload.amount,
    currency: payload.currency === "USD" || payload.currency === "CNY" ? payload.currency : "VND",
    reference: payload.transferContent,
    dueDate: payload.dueDate ?? null,
  };
}

/**
 * PAYMENT_INFO / PAYMENT_REMINDER (plan B.7.5, 16 BR-06): the shop's account, what is still owed
 * and the transfer content, each copyable, and the VietQR code that fills them in when the BE sends
 * one (plan E1). No action: the customer pays outside the system.
 */
export function TransferCard({
  payload,
  reminder,
}: {
  payload: TransferCardPayload;
  reminder: boolean;
}) {
  const overdue = payload.overdue === true;
  const settled = SETTLED.has(payload.status ?? "");
  const transfer = asTransfer(payload);
  return (
    <CardFrame
      eyebrow={reminder ? "Nhắc thanh toán" : "Thông tin chuyển khoản"}
      title={`Đợt ${payload.seq ?? ""} · ${payload.name ?? "Thanh toán"}`}
      status={installmentStatusMeta(payload.status, overdue)}
      footer={
        payload.orderId ? (
          <Link href={STORE_ROUTES.account.orders.detail(payload.orderId)} className={CARD_LINK}>
            Xem đơn hàng
          </Link>
        ) : undefined
      }
    >
      <Facts>
        {payload.contractNumber ? (
          <Fact label="Hợp đồng" numeric>
            <span className="font-mono">{payload.contractNumber}</span>
          </Fact>
        ) : null}
        {payload.installmentAmount !== null && payload.installmentAmount !== undefined ? (
          <Fact label="Giá trị đợt" numeric>
            {cardMoney(payload.installmentAmount, payload.currency)}
          </Fact>
        ) : null}
        <Fact label="Còn phải trả" numeric>
          <span className="text-ink-primary font-semibold">
            {cardMoney(payload.amount, payload.currency)}
          </span>
        </Fact>
      </Facts>
      {overdue && !settled ? (
        <Alert tone="danger" title="Đợt thanh toán đã quá hạn.">
          Vui lòng chuyển khoản sớm hoặc nhắn Sale nếu bạn cần hỗ trợ.
        </Alert>
      ) : null}
      {settled ? (
        <p className="text-ink-secondary">
          {payload.status === "PAID"
            ? "Đợt này đã được ghi nhận thanh toán đủ."
            : "Đợt thanh toán này đã huỷ, bạn không cần chuyển khoản."}
        </p>
      ) : transfer && payload.amount > 0 ? (
        <>
          {payload.vietQr ? <VietQrCode payload={payload.vietQr} /> : null}
          <TransferInstructionsBlock transfer={transfer} />
        </>
      ) : payload.amount > 0 ? (
        <Alert tone="warning" title="Chưa có thông tin chuyển khoản.">
          Cửa hàng chưa cấu hình tài khoản nhận tiền, vui lòng nhắn Sale để được hướng dẫn.
        </Alert>
      ) : null}
    </CardFrame>
  );
}
