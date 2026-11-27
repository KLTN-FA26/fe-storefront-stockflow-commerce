"use client";

import Link from "next/link";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Alert, ConfirmDialog, EmptyState, PageHeader, Skeleton } from "@/components/shared";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { hasErrorCode } from "@/lib/api/describe-error";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { formatDateTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { allowedCreditRequestActions } from "../lifecycle";
import { describeCreditRequestError, useWithdrawCreditRequest } from "../mutations";
import { useCreditRequest } from "../queries";

import { FilesCard } from "./files-card";
import { CreditRequestStatusBadge } from "./status-badge";

const BUTTON = "min-h-11 rounded-[var(--r-md)] px-4";

/**
 * `/credit-requests/{id}` (handoff A4): the link of the "đề nghị đã có kết quả" notification. What was asked, where it
 * stands, the outcome — with the accountant's reason when rejected — and the documents. Another customer's request is
 * a 404, shown as not found.
 */
export function CreditRequestDetail({ id }: { id: string }) {
  const signedIn = useSignedIn();
  const query = useCreditRequest(id, signedIn === true);
  const withdraw = useWithdrawCreditRequest();
  const [confirming, setConfirming] = useState(false);

  if (query.isPending)
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-64 w-full rounded-[var(--r-lg)]" />
    );
  if (query.isError) {
    if (hasErrorCode(query.error, "CREDIT_REQUEST_NOT_FOUND"))
      return (
        <EmptyState
          title="Không tìm thấy đề nghị"
          description="Đề nghị không tồn tại hoặc không thuộc tài khoản của bạn."
          action={
            <Button asChild className={BUTTON}>
              <Link href={STORE_ROUTES.account.home}>Về hồ sơ của tôi</Link>
            </Button>
          }
        />
      );
    return <Alert tone="danger">{describeCreditRequestError(query.error)}</Alert>;
  }
  const request = query.data;
  const money = (amount: number) => formatMoney(amount, request.currency);
  const actions = allowedCreditRequestActions(request);
  const rows = [
    { label: "Hạn mức xin", value: money(request.requestedLimit) },
    { label: "Kỳ hạn xin", value: `${request.requestedTermDays} ngày` },
    { label: "Gửi lúc", value: formatDateTime(request.submittedAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Đề nghị cấp hạn mức"
        {...(request.source === "SALES" ? { subtitle: "Sale gửi thay bạn" } : {})}
      />
      <SurfaceCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CreditRequestStatusBadge status={request.status} />
          {actions.includes("withdraw") ? (
            <Button
              variant="outline"
              className={BUTTON}
              disabled={withdraw.isPending}
              onClick={() => setConfirming(true)}
            >
              Rút đề nghị
            </Button>
          ) : null}
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-ink-secondary text-sm">{row.label}</dt>
              <dd className="text-ink-primary font-display text-lg font-bold tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {request.reason ? (
          <p className="text-ink-secondary text-sm whitespace-pre-line">Lý do: {request.reason}</p>
        ) : null}
        {request.status === "APPROVED" ? (
          <Alert tone="info" title="Đề nghị đã được duyệt.">
            Hạn mức mới: {money(request.approvedLimit ?? 0)}
            {request.approvedTermDays != null ? `, kỳ hạn ${request.approvedTermDays} ngày` : ""}.
            {request.decisionNote ? ` ${request.decisionNote}` : ""}
          </Alert>
        ) : null}
        {request.status === "REJECTED" ? (
          <Alert tone="danger" title="Đề nghị không được duyệt.">
            {request.decisionNote
              ? `Lý do: ${request.decisionNote}`
              : "Vui lòng liên hệ Sale để biết thêm."}
          </Alert>
        ) : null}
        {withdraw.error ? (
          <div role="alert">
            <Alert tone="danger">{describeCreditRequestError(withdraw.error)}</Alert>
          </div>
        ) : null}
      </SurfaceCard>
      <FilesCard request={request} canAttach={actions.includes("attach")} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Rút đề nghị cấp hạn mức?"
        description="Đề nghị sẽ kết thúc. Bạn có thể gửi đề nghị mới sau."
        confirmLabel="Rút đề nghị"
        onConfirm={() => {
          setConfirming(false);
          withdraw.mutate({ id: request.id, version: request.version });
        }}
      />
    </div>
  );
}
