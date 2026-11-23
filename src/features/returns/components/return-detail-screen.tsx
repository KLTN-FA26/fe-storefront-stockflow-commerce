"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PackageOpen } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, ConfirmDialog } from "@/components/shared";
import { DocumentDownloadButton } from "@/components/storefront/document-download-button";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { Button } from "@/components/ui/button";
import { getMyReturnReceiptVoucher } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/format/date";
import {
  RETURN_REASON_LABEL,
  describeReturnError,
  canWithdrawReturn,
  withdrawHeldByCount,
  goodsReceived,
  isReturnNotFound,
  isWithdrawable,
  refundOutcome,
  refusalReasonText,
  returnStatusMeta,
  useCancelMyReturn,
  useMyReturn,
  type CustomerReturn,
} from "@/lib/returns";
import { beId } from "@/lib/validation/primitives";

import { ReturnHistoryCard, ReturnLinesCard, ReturnMoneyCard } from "./return-detail-sections";
import { ReturnPhotosCard } from "./return-photos-card";
import { ReturnDetailSkeleton, ReturnLoadError } from "./return-states";

const isId = (value: string) => beId().safeParse(value).success;

/**
 * Yêu cầu xong mà không hoàn tiền (WF-05 Q-4, SF-01): lý do trong danh sách cố định và ghi chú công
 * khai của Sales — văn bản trả lời khiếu nại của khách. Hàng đã gửi về mà không được hoàn vẫn là của
 * khách (không có thoả thuận trả hàng): Sales liên hệ để gửi trả hoặc huỷ hộ có biên bản.
 */
function NotRefunded({ request }: { request: CustomerReturn }) {
  const outcome = refundOutcome(request);
  const reason = refusalReasonText(request);
  const goodsBack = goodsReceived(request);
  return (
    <Alert tone="info" title={returnStatusMeta(request).label}>
      <span className="block">
        {outcome === "REFUSED"
          ? reason
            ? `Yêu cầu đã được xem xét và không được hoàn tiền. Lý do: ${reason}.`
            : "Yêu cầu đã được xem xét và không được hoàn tiền."
          : "Yêu cầu đã kết thúc và không có khoản hoàn tiền nào."}
      </span>
      {request.refusalNote ? (
        <span className="mt-1 block whitespace-pre-line">{request.refusalNote}</span>
      ) : null}
      {goodsBack ? (
        <span className="mt-1 block">
          Hàng bạn đã gửi về vẫn thuộc về bạn. Sales sẽ liên hệ để thống nhất gửi trả lại hoặc huỷ
          hộ (có biên bản).
        </span>
      ) : null}
      <span className="mt-1 block">Nếu cần giải thích thêm, hãy chat với Sales.</span>
    </Alert>
  );
}

/** Việc khách cần làm / đang chờ, theo trạng thái (17 §4.10). */
function NextStep({ request }: { request: CustomerReturn }) {
  const meta = returnStatusMeta(request);
  const outcome = refundOutcome(request);
  if (outcome === "REFUSED" || outcome === "NOTHING_TO_REFUND") {
    return <NotRefunded request={request} />;
  }
  if (request.status === "AWAITING_RETURN") {
    return (
      <Alert tone="warning" title="Gửi hàng về kho">
        <PackageOpen aria-hidden className="mr-1 inline size-3.5" />
        Gửi số hàng được duyệt về kho
        {request.returnDeadline ? ` trước ngày ${formatDate(request.returnDeadline)}` : ""}, ghi số{" "}
        <span className="font-mono font-semibold">{request.rmaNumber}</span> trên kiện hàng. Quá
        hạn, yêu cầu sẽ hết hiệu lực.
      </Alert>
    );
  }
  if (request.status === "REJECTED") {
    return (
      <Alert tone="danger" title="Yêu cầu bị từ chối">
        {request.rejectionReason ?? meta.help}
      </Alert>
    );
  }
  return meta.help ? (
    <Alert tone="info" title={meta.label}>
      {meta.help}
    </Alert>
  ) : null;
}

export function ReturnDetailScreen({ returnId: raw }: { returnId: string }) {
  const returnId = raw.toLowerCase();
  const valid = isId(returnId);
  const { data: request, isPending, isFetching, error, refetch } = useMyReturn(returnId, valid);
  const withdraw = useCancelMyReturn();
  const [confirming, setConfirming] = useState(false);

  if (!valid || isReturnNotFound(error)) notFound();
  if (isPending) return <ReturnDetailSkeleton />;
  if (!request) {
    return (
      <ReturnLoadError
        title="Không tải được yêu cầu trả hàng"
        error={error}
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    );
  }
  const meta = returnStatusMeta(request);

  return (
    <div className="space-y-5">
      <div className="border-border-default border-b pb-3.5">
        <Link
          href={STORE_ROUTES.account.returns.list}
          className="text-ink-secondary hover:text-ink-primary focus-visible:ring-accent -ml-2 inline-flex min-h-11 items-center rounded-full px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden className="mr-1 size-4" />
          Trả hàng
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-ink-primary text-xl font-bold sm:text-2xl">
            Yêu cầu <span className="font-mono">{request.rmaNumber}</span>
          </h1>
          <ToneBadge label={meta.label} tone={meta.tone} />
        </div>
        <p className="text-ink-secondary mt-1 text-sm">
          Đơn{" "}
          <Link
            href={STORE_ROUTES.account.orders.detail(request.orderId)}
            className="text-accent font-mono font-semibold hover:underline"
          >
            {request.orderNumber ?? "—"}
          </Link>{" "}
          · Gửi lúc {formatDateTime(request.requestedAt)}
        </p>
      </div>

      <div role="status">
        <NextStep request={request} />
      </div>
      {withdraw.error ? (
        <Alert tone="danger" title="Chưa rút được yêu cầu">
          {describeReturnError(withdraw.error)}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="min-w-0 space-y-5">
          <section className="border-border-default bg-bg-surface space-y-1 rounded-[var(--r-lg)] border p-[var(--card-pad)] text-sm shadow-[var(--card-shadow)]">
            <p className="text-ink-tertiary text-xs">Lý do</p>
            <p className="text-ink-primary font-medium">
              {RETURN_REASON_LABEL[request.reasonCode]}
            </p>
            {request.description ? (
              <p className="text-ink-secondary whitespace-pre-line">{request.description}</p>
            ) : null}
          </section>
          <ReturnLinesCard request={request} />
          <ReturnPhotosCard request={request} />
        </div>
        <div className="space-y-5">
          <ReturnMoneyCard request={request} />
          {goodsReceived(request) ? (
            // Mẫu 01-VT of what the warehouse confirmed received (documents/endpoints.md 3c).
            <DocumentDownloadButton
              kind="returnReceiptVoucher"
              className="w-full"
              label="Tải phiếu nhập kho"
              ariaLabel={`Tải phiếu nhập kho hàng trả ${request.rmaNumber}`}
              load={() => getMyReturnReceiptVoucher(request.id, request.rmaNumber)}
            />
          ) : null}
          <ReturnHistoryCard request={request} />
          {canWithdrawReturn(request) ? (
            <Button
              type="button"
              variant="outline"
              className="border-border-strong text-danger hover:bg-bg-muted min-h-11 w-full rounded-[var(--r-md)]"
              disabled={withdraw.isPending}
              onClick={() => setConfirming(true)}
            >
              {withdraw.isPending ? "Đang rút..." : "Rút yêu cầu trả hàng"}
            </Button>
          ) : withdrawHeldByCount(request) ? (
            // WF-05 BE-23: the warehouse is counting a parcel on a draft receipt.
            <p className="text-ink-secondary text-sm">
              Kho đang kiểm đếm một kiện hàng trả của yêu cầu này nên tạm thời chưa rút được yêu
              cầu. Khi kho xác nhận hoặc huỷ lần kiểm đếm, trang sẽ cập nhật.
            </p>
          ) : isWithdrawable(request.status) ? (
            // A parcel is already in the warehouse (WF-05 TH-3): Sales settle what came back.
            <p className="text-ink-secondary text-sm">
              Kho đã nhận một phần hàng nên không rút được yêu cầu.
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rút yêu cầu trả hàng?"
        description="Yêu cầu sẽ đóng lại và đơn tiếp tục chờ hoàn tất. Nếu cần trả hàng sau này, bạn phải gửi yêu cầu mới trong hạn đổi / trả."
        confirmLabel="Rút yêu cầu"
        onConfirm={() => withdraw.mutate({ returnId: request.id })}
      />
    </div>
  );
}
