"use client";

import { useState } from "react";
import Link from "next/link";
import { FileDown, MessageCircle, RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, Skeleton } from "@/components/shared";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { getMyOrderContractDocument } from "../contract-api";
import { CONTRACT_STATUS_META } from "../contract-labels";
import { useMyOrderContract } from "../contract-queries";
import type { Contract } from "../contract-schemas";
import { ContractDeliverySchedule, ContractPaymentPlan } from "./order-contract-schedule";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

function Totals({ contract }: { contract: Contract }) {
  const rows = [
    ["Tổng chưa thuế", contract.totals.netAmount],
    ["Thuế VAT", contract.totals.taxAmount],
  ] as const;
  return (
    <dl className="space-y-1.5 text-sm">
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="text-ink-secondary">{label}</dt>
          <dd className="text-ink-primary tabular-nums">{formatMoney(amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4">
        <dt className="text-ink-primary font-semibold">Tổng có thuế</dt>
        <dd className="text-ink-primary font-bold tabular-nums">
          {formatMoney(contract.totals.totalAmount)}
        </dd>
      </div>
    </dl>
  );
}

function DownloadButton({ orderId, contractNumber }: { orderId: string; contractNumber: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    // Opened in the click's own turn so the browser allows it; pointed at the link once known.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    getMyOrderContractDocument(orderId)
      .then((link) => {
        if (tab) tab.location.replace(link.url);
        else window.location.assign(link.url);
      })
      .catch((failure: unknown) => {
        tab?.close();
        setError(describeApiError(failure));
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full rounded-[var(--r-md)] px-4"
        disabled={busy}
        onClick={open}
        aria-label={`Tải hợp đồng ${contractNumber}`}
      >
        <FileDown aria-hidden className="mr-2 size-4" />
        {busy ? "Đang tải..." : "Tải hợp đồng"}
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The order's sales contract once Sales sent it (WF-02 D3, kltn-docs 14 §4.3 step 13, 17 §5.2):
 * number, status, delivery schedule, payment plan, totals, signing date; the file (signed once
 * signed, else as sent) and a conversation with Sales about it. No contract yet: no card.
 */
export function OrderContractCard({ orderId }: { orderId: string }) {
  const query = useMyOrderContract(orderId);
  if (query.data === null) return null;
  const contract = query.data;

  return (
    <section className={`${CARD} space-y-4`} aria-labelledby="order-contract-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="order-contract-heading"
            className="font-display text-ink-primary text-base font-semibold"
          >
            Hợp đồng mua bán
          </h2>
          {contract ? (
            <p className="text-ink-secondary font-mono text-sm tabular-nums">
              {contract.contractNumber}
            </p>
          ) : null}
        </div>
        {contract ? <ToneBadge size="sm" {...CONTRACT_STATUS_META[contract.status]} /> : null}
      </div>
      {query.isPending ? (
        <Skeleton
          role="status"
          aria-label="Đang tải"
          className="h-32 w-full rounded-[var(--r-md)]"
        />
      ) : !contract ? (
        <div className="space-y-2" role="alert">
          <Alert tone="warning" title="Không tải được hợp đồng.">
            {describeApiError(query.error)}
          </Alert>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden className="mr-2 size-4" />
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          {contract.status === "SENT" ? (
            <p className="text-ink-secondary text-sm">
              Hợp đồng đang chờ ký. Bạn có thể gửi lại file đã ký qua chat với Sale.
            </p>
          ) : null}
          {contract.signedOn ? (
            <p className="text-ink-secondary text-sm">
              Ngày ký:{" "}
              <span className="text-ink-primary font-medium tabular-nums">
                {formatDate(contract.signedOn)}
              </span>
            </p>
          ) : null}
          <ContractDeliverySchedule batches={contract.deliverySchedule} />
          <ContractPaymentPlan plan={contract.paymentPlan} />
          <Totals contract={contract} />
          <div className="grid gap-2">
            <DownloadButton orderId={orderId} contractNumber={contract.contractNumber} />
            <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
              <Link href={STORE_ROUTES.chat.about("CONTRACT", contract.id)}>
                <MessageCircle aria-hidden className="mr-2 size-4" />
                Chat với Sale
              </Link>
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
