"use client";

import Link from "next/link";
import { MessageCircle, RefreshCw } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, Skeleton } from "@/components/shared";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { DocumentDownloadButton } from "@/components/storefront/document-download-button";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { RETURN_WINDOW_DAYS } from "@/lib/domain/return-window";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { formatNumber } from "@/lib/format/number";
import { getMyContractAppendix, getMyContractLiquidation } from "@/lib/documents";

import { CONTRACT_STATUS_META } from "../contract-labels";
import { useMyDeliverySchedule, useMyOrderContract } from "../contract-queries";
import type { Contract } from "../contract-schemas";
import type { OrderStatus } from "../types";
import { ContractDownloadButton } from "./contract-download-button";
import { CONTRACT_SECTION_ID, ContractSigningSteps } from "./contract-signing-steps";
import { ContractDeliverySchedule, ContractPaymentPlan } from "./order-contract-schedule";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="text-ink-primary text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * The terms the chat's contract card shows too (SF-UX-36): the free print-sample rounds, the
 * complaint period after each delivery, and the total — "Tổng có VAT", the one name for it on the
 * page; the VAT split is in the order's total card (SF-UX-32).
 */
function Terms({ contract }: { contract: Contract }) {
  return (
    <dl className="border-border-default space-y-1.5 border-t pt-3 text-sm">
      {contract.freeSampleRounds != null ? (
        <Term label="In mẫu miễn phí">{formatNumber(contract.freeSampleRounds)} lần</Term>
      ) : null}
      <Term label="Thời hạn khiếu nại">
        {formatNumber(contract.returnWindowDays ?? RETURN_WINDOW_DAYS)} ngày sau mỗi đợt giao
      </Term>
      <div className="flex justify-between gap-4">
        <dt className="text-ink-primary font-semibold">Tổng có VAT</dt>
        <dd className="text-ink-primary font-bold tabular-nums">
          {formatMoney(contract.totals.totalAmount)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Where nothing more is delivered or charged on the order (BE ContractPaperService#ended): the
 * contract can be liquidated. The BE still refuses while money is left (Còn lại ≠ 0); that refusal
 * shows under the button.
 */
const ENDED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "COMPLETED",
  "CANCELLED",
  "CLOSED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

/**
 * The papers that follow a signed contract (documents 1c, 2c): its appendix only when the BE says
 * there is one (`appendixAvailable`: a delivery window moved since signing), and its liquidation.
 */
function ContractPapers({
  orderId,
  contract,
  orderStatus,
}: {
  orderId: string;
  contract: Contract;
  orderStatus: OrderStatus | undefined;
}) {
  if (!contract.signedOn) return null;
  const liquidable =
    contract.status === "COMPLETED" ||
    contract.status === "LIQUIDATED" ||
    (orderStatus !== undefined && ENDED.has(orderStatus));
  return (
    <>
      {contract.appendixAvailable ? (
        <DocumentDownloadButton
          kind="contractAppendix"
          className="w-full"
          label="Tải phụ lục hợp đồng"
          ariaLabel={`Tải phụ lục hợp đồng ${contract.contractNumber}`}
          load={() => getMyContractAppendix(orderId, contract.contractNumber)}
        />
      ) : null}
      {liquidable ? (
        <DocumentDownloadButton
          kind="contractLiquidation"
          className="w-full"
          label="Tải biên bản thanh lý"
          ariaLabel={`Tải biên bản thanh lý hợp đồng ${contract.contractNumber}`}
          load={() => getMyContractLiquidation(orderId, contract.contractNumber)}
        />
      ) : null}
    </>
  );
}

function Files({
  orderId,
  contract,
  orderStatus,
}: {
  orderId: string;
  contract: Contract;
  orderStatus: OrderStatus | undefined;
}) {
  const signed = Boolean(contract.signedOn || contract.signedFileName);
  return (
    <div className="grid gap-2">
      {signed ? (
        <>
          <ContractDownloadButton
            orderId={orderId}
            contractNumber={contract.contractNumber}
            label="Tải bản đã ký"
          />
          <ContractDownloadButton
            orderId={orderId}
            contractNumber={contract.contractNumber}
            copy="sent"
            label="Tải bản gửi ký"
          />
        </>
      ) : contract.status === "SENT" ? null : (
        <ContractDownloadButton
          orderId={orderId}
          contractNumber={contract.contractNumber}
          label="Tải hợp đồng"
        />
      )}
      <ContractPapers orderId={orderId} contract={contract} orderStatus={orderStatus} />
      <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
        <Link href={STORE_ROUTES.chat.about("CONTRACT", contract.id)}>
          <MessageCircle aria-hidden className="mr-2 size-4" />
          Chat với Sale
        </Link>
      </Button>
    </div>
  );
}

/**
 * The order's sales contract once Sales sent it (WF-02 D3, kltn-docs 14 §4.3 step 13, 17 §5.2):
 * number, status, the three signing steps while it waits on the customer (SF-UX-24), delivery
 * schedule, payment plan, terms and total, signing date, its files and a conversation with Sales
 * about it. No contract yet: no card. Its id, `hop-dong`, is where chat cards link to.
 */
export function OrderContractCard({
  orderId,
  orderStatus,
}: {
  orderId: string;
  /** The order's own status: the liquidation paper is offered once the order ended. */
  orderStatus?: OrderStatus;
}) {
  const query = useMyOrderContract(orderId);
  // The windows in force refine the contract's schedule; asked once a contract is there to show
  const schedule = useMyDeliverySchedule(orderId, Boolean(query.data));
  if (query.data === null) return null;
  const contract = query.data;

  return (
    <section
      id={CONTRACT_SECTION_ID}
      className={`${CARD} scroll-mt-[var(--sticky-top)] space-y-4`}
      aria-labelledby="order-contract-heading"
    >
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
            <ContractSigningSteps
              orderId={orderId}
              contractId={contract.id}
              contractNumber={contract.contractNumber}
            />
          ) : null}
          {contract.signedOn ? (
            <p className="text-ink-secondary text-sm">
              Ngày ký:{" "}
              <span className="text-ink-primary font-medium tabular-nums">
                {formatDate(contract.signedOn)}
              </span>
            </p>
          ) : null}
          <ContractDeliverySchedule batches={contract.deliverySchedule} effective={schedule.data} />
          <ContractPaymentPlan plan={contract.paymentPlan} />
          <Terms contract={contract} />
          <Files orderId={orderId} contract={contract} orderStatus={orderStatus} />
        </>
      )}
    </section>
  );
}
