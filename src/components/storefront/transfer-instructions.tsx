"use client";

import { RefreshCw } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  INSTALLMENT_NOT_PAYABLE_CODE,
  TRANSFER_UNAVAILABLE_CODE,
  useMyInstallmentTransfer,
  type InstallmentTransfer,
} from "@/lib/installments";

import { CopyFieldButton } from "./copy-field-button";

interface FieldProps {
  label: string;
  value: string;
  /** Names the field for the copy button; without it the value is not copyable. */
  copyName?: string;
  emphasis?: boolean;
}

function Field({ label, value, copyName, emphasis = false }: FieldProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-secondary shrink-0">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right">
        <span
          className={
            emphasis
              ? "text-ink-primary font-mono font-semibold break-all tabular-nums"
              : "text-ink-primary font-medium break-words"
          }
        >
          {value}
        </span>
        {copyName ? <CopyFieldButton value={value} fieldName={copyName} /> : null}
      </dd>
    </div>
  );
}

/**
 * How to pay one installment by bank transfer (kltn-docs 15 §4.2 step 5): the shop's account, what
 * the installment still owes, and the transfer content (contract number + installment) the
 * accountant matches the bank statement line against.
 */
export function TransferInstructionsBlock({ transfer }: { transfer: InstallmentTransfer }) {
  const headingId = `transfer-${transfer.installmentId}`;
  return (
    <section
      aria-labelledby={headingId}
      className="border-border-default bg-bg-subtle space-y-3 rounded-[var(--r-md)] border p-3 text-left sm:p-4"
    >
      <h3 id={headingId} className="text-ink-primary text-sm font-semibold">
        Thông tin chuyển khoản
      </h3>
      <dl className="space-y-1 text-sm">
        <Field label="Ngân hàng" value={transfer.bankName} />
        <Field
          label="Số tài khoản"
          value={transfer.accountNumber}
          copyName="số tài khoản"
          emphasis
        />
        <Field label="Chủ tài khoản" value={transfer.accountName} />
        <Field
          label="Nội dung chuyển khoản"
          value={transfer.reference}
          copyName="nội dung chuyển khoản"
          emphasis
        />
        <Field
          label="Số tiền cần chuyển"
          value={formatMoney(transfer.amountDue, transfer.currency)}
          emphasis
        />
        {transfer.dueDate ? (
          <Field label="Hạn thanh toán" value={formatDate(transfer.dueDate)} />
        ) : null}
      </dl>
      <p className="text-ink-tertiary text-xs">
        Hãy ghi đúng nội dung chuyển khoản để kế toán đối chiếu khoản tiền với đúng đợt thanh toán.
      </p>
    </section>
  );
}

/**
 * The transfer block of one of the customer's installments, read from the BE. The shop not having
 * set its account up (503) is told as such, with Sales as the way forward, not as a page error; an
 * installment paid meanwhile (409) says there is nothing left to transfer.
 */
export function InstallmentTransferSection({ installmentId }: { installmentId: string }) {
  const query = useMyInstallmentTransfer(installmentId);

  if (query.isPending) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-32 w-full rounded-[var(--r-md)]" />
    );
  }
  if (query.error) {
    const code = query.error instanceof ApiError ? query.error.code : undefined;
    if (code === TRANSFER_UNAVAILABLE_CODE) {
      return (
        <div role="status">
          <Alert tone="warning" title="Chưa có thông tin chuyển khoản.">
            Cửa hàng chưa cấu hình tài khoản nhận tiền, vui lòng liên hệ Sale để được hướng dẫn
            thanh toán.
          </Alert>
        </div>
      );
    }
    if (code === INSTALLMENT_NOT_PAYABLE_CODE) {
      return (
        <div role="status">
          <Alert tone="info" title="Đợt này không cần chuyển thêm tiền.">
            Đợt thanh toán đã được ghi nhận đủ hoặc đã huỷ. Tải lại trang để xem trạng thái mới
            nhất.
          </Alert>
        </div>
      );
    }
    return (
      <div className="space-y-2" role="alert">
        <Alert tone="warning" title="Không tải được thông tin chuyển khoản.">
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
    );
  }
  return query.data ? <TransferInstructionsBlock transfer={query.data} /> : null;
}
