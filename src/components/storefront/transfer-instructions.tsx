"use client";

import { RefreshCw } from "lucide-react";

import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { ApiError } from "@/lib/api/error";
import { formatMoney } from "@/lib/format/money";
import {
  TRANSFER_UNAVAILABLE_CODE,
  useTransferInstructions,
  type TransferInstructions,
} from "@/lib/transfer-instructions";

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
 * Where and how to transfer (kltn-docs 15 §4.1): the shop's account, the transfer content (the order
 * number, so the accountant can match the statement line) and what is due now. Nothing when the BE
 * says there is nothing to transfer (`dueBy` NONE).
 */
export function TransferInstructionsBlock({
  instructions,
}: {
  instructions: TransferInstructions;
}) {
  if (instructions.dueBy === "NONE") return null;
  return (
    <section
      aria-labelledby="transfer-instructions-heading"
      className="border-border-default bg-bg-subtle space-y-3 rounded-[var(--r-md)] border p-3 text-left sm:p-4"
    >
      <h3 id="transfer-instructions-heading" className="text-ink-primary text-sm font-semibold">
        Thông tin chuyển khoản
      </h3>
      <dl className="space-y-1 text-sm">
        <Field label="Ngân hàng" value={instructions.bankName} />
        <Field
          label="Số tài khoản"
          value={instructions.accountNumber}
          copyName="số tài khoản"
          emphasis
        />
        <Field label="Chủ tài khoản" value={instructions.accountName} />
        <Field
          label="Nội dung chuyển khoản"
          value={instructions.transferReference}
          copyName="nội dung chuyển khoản"
          emphasis
        />
        <Field
          label="Số tiền cần chuyển"
          value={formatMoney(instructions.amountDue, instructions.currency)}
          emphasis
        />
      </dl>
      {instructions.dueByNote ? (
        <p className="text-ink-secondary text-sm">{instructions.dueByNote}</p>
      ) : null}
      <p className="text-ink-tertiary text-xs">
        Hãy ghi đúng nội dung chuyển khoản để chúng tôi đối chiếu khoản thanh toán với đơn hàng.
      </p>
    </section>
  );
}

/**
 * The transfer block of one of the customer's own orders, read from the BE. The shop not having set
 * its account up (503) is told as such, with Sales as the way forward, not as a page error.
 */
export function TransferInstructionsSection({ orderId }: { orderId: string }) {
  const query = useTransferInstructions(orderId);

  if (query.isPending) {
    return (
      <Skeleton role="status" aria-label="Đang tải" className="h-32 w-full rounded-[var(--r-md)]" />
    );
  }
  if (query.error) {
    if (query.error instanceof ApiError && query.error.code === TRANSFER_UNAVAILABLE_CODE) {
      return (
        <div role="status">
          <Alert tone="warning" title="Chưa có thông tin chuyển khoản.">
            Cửa hàng chưa cấu hình tài khoản nhận tiền, vui lòng liên hệ Sale để được hướng dẫn
            thanh toán.
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
  return query.data ? <TransferInstructionsBlock instructions={query.data} /> : null;
}
