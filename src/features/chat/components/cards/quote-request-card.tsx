import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { formatDate } from "@/lib/format/date";
import { formatNumber } from "@/lib/format/number";

import { ToneBadge } from "@/components/storefront/tone-badge";

import type { DesignQuoteRequestPayload, ProjectQuoteRequestPayload } from "../../card-payloads";
import { designStatusMeta, requestStatusMeta } from "../../labels";
import { CARD_LINK, CardFrame, Fact, Facts } from "./card-frame";

/**
 * QUOTE_REQUEST cards (plan B.7.1–B.7.2, 16 BR-11). The customer has no button on them: drawing
 * the quote up is Sales' (`staffActions: CREATE_QUOTE`), which the storefront never reads.
 */

function QuoteDrawnUp({
  quoteId,
  quoteNumber,
}: {
  quoteId: string;
  quoteNumber: string | null | undefined;
}) {
  return (
    <p className="text-ink-secondary">
      Sale đã lập báo giá{" "}
      <Link
        href={STORE_ROUTES.account.quotes.detail(quoteId)}
        className="text-accent font-mono font-semibold tabular-nums hover:underline"
      >
        {quoteNumber ?? "từ yêu cầu này"}
      </Link>
      .
    </p>
  );
}

const cartonsText = (cartons: number | null | undefined) =>
  cartons ? `${formatNumber(cartons)} thùng` : "—";

export function DesignQuoteRequestCard({ payload }: { payload: DesignQuoteRequestPayload }) {
  const returned = Boolean(payload.returnReason);
  const design = designStatusMeta(payload.designStatus, returned);
  return (
    <CardFrame
      eyebrow="Yêu cầu báo giá"
      title={payload.designName}
      status={requestStatusMeta(payload.requestStatus)}
      footer={
        <Link href={STORE_ROUTES.design.detail(payload.designId)} className={CARD_LINK}>
          Xem bản thiết kế
        </Link>
      }
    >
      <Facts>
        <Fact label="Bản thiết kế">
          <ToneBadge label={design.label} tone={design.tone} size="sm" />
        </Fact>
        <Fact label="SKU riêng">
          <span className="font-mono">{payload.customerSku ?? "Có sau khi bản được duyệt"}</span>
        </Fact>
        <Fact label="Số thùng mong muốn" numeric>
          {cartonsText(payload.cartons)}
        </Fact>
        <Fact label="Ngày giao mong muốn" numeric>
          {payload.desiredDeliveryDate ? formatDate(payload.desiredDeliveryDate) : "—"}
        </Fact>
      </Facts>
      {returned ? (
        <p className="border-danger/30 bg-danger/5 text-ink-primary rounded-[var(--r-md)] border p-2.5">
          <span className="font-semibold">Lý do trả lại: </span>
          {payload.returnReason}
        </p>
      ) : null}
      {payload.designStatus === "PENDING_REVIEW" ? (
        <p className="text-ink-secondary">Sale sẽ lập báo giá ngay khi bản thiết kế được duyệt.</p>
      ) : null}
      {payload.quoteId ? (
        <QuoteDrawnUp quoteId={payload.quoteId} quoteNumber={payload.quoteNumber} />
      ) : null}
    </CardFrame>
  );
}

export function ProjectQuoteRequestCard({ payload }: { payload: ProjectQuoteRequestPayload }) {
  return (
    <CardFrame
      eyebrow="Yêu cầu báo giá cả dự án"
      title={payload.projectName}
      status={requestStatusMeta(payload.status)}
      footer={
        <Link href={STORE_ROUTES.design.project(payload.projectId)} className={CARD_LINK}>
          Xem dự án
        </Link>
      }
    >
      <Facts>
        <Fact label="Ngày giao mong muốn" numeric>
          {payload.desiredDeliveryDate ? formatDate(payload.desiredDeliveryDate) : "—"}
        </Fact>
      </Facts>
      <ul className="divide-border-default border-border-default divide-y rounded-[var(--r-md)] border">
        {payload.lines.map((line) => {
          const design = designStatusMeta(line.designStatus, false);
          return (
            <li key={line.designId} className="space-y-1 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink-primary font-medium break-words">{line.designName}</span>
                <ToneBadge label={design.label} tone={design.tone} size="sm" className="shrink-0" />
              </div>
              <p className="text-ink-secondary tabular-nums">
                <span className="font-mono">{line.customerSku ?? "Chưa có SKU riêng"}</span>
                {" · "}
                {cartonsText(line.cartons)}
              </p>
            </li>
          );
        })}
      </ul>
      {payload.quoteId ? (
        <QuoteDrawnUp quoteId={payload.quoteId} quoteNumber={payload.quoteNumber} />
      ) : null}
    </CardFrame>
  );
}
