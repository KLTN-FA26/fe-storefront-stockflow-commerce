"use client";

import { RefreshCw } from "lucide-react";
import { useQueryState } from "nuqs";

import { Alert, PageHeader, Skeleton } from "@/components/shared";
import { FilterPill } from "@/components/storefront/filter-pill";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { formatNumber } from "@/lib/format/number";
import { useMyInstallments } from "@/lib/installments";

import {
  PAYMENT_FILTERS,
  PAYMENT_FILTER_LABEL,
  paymentFilterParser,
  paymentRows,
  type PaymentFilter,
} from "../filters";
import { DebtReconciliationCard } from "./debt-reconciliation-card";
import { INSTALLMENTS_PERMISSION } from "./my-installments";
import { MyInstallmentRow } from "./my-installment-row";

/** The BE pages at most 200: one read covers a customer's installments, sorted and filtered here. */
const PAGE_SIZE = 200;

const EMPTY: Record<PaymentFilter, string> = {
  "can-tra": "Không có đợt nào cần thanh toán lúc này.",
  "qua-han": "Không có đợt nào quá hạn.",
  "chua-den-han": "Không có đợt nào chưa đến hạn.",
  "da-tra": "Chưa có đợt nào đã thanh toán.",
  "tat-ca": "Bạn chưa có đợt thanh toán nào. Lịch thanh toán xuất hiện khi hợp đồng được ký.",
};

/**
 * "Thanh toán" (SF-UX-39): every installment of the customer's contracts, overdue and due first, a
 * "Quá hạn" filter, and each owing one's transfer details in place — paying no longer takes three
 * steps through the account page and the order. Read only for an account holding
 * `payment-installments:READ`; the BE re-checks.
 */
export function PaymentsScreen() {
  const signedIn = useSignedIn();
  const permissions = useMyPermissions();
  const allowed = useHasPermission(INSTALLMENTS_PERMISSION) && !permissions.isPending;
  const [filter, setFilter] = useQueryState("loc", paymentFilterParser);
  const query = useMyInstallments({ page: 0, size: PAGE_SIZE }, signedIn === true && allowed);
  const all = query.data?.items ?? [];
  const rows = paymentRows(all, filter);
  const count = (option: PaymentFilter) => paymentRows(all, option).length;

  return (
    <>
      <PageHeader
        titleHidden
        title="Thanh toán"
        subtitle="Các đợt thanh toán theo hợp đồng: đợt quá hạn và đến hạn ở trên cùng."
      />
      <div className="space-y-4">
        {!permissions.isPending && !allowed ? (
          <Alert tone="info" title="Tài khoản chưa xem được lịch thanh toán.">
            Hãy chat với Sale nếu bạn cần biết các đợt thanh toán của mình.
          </Alert>
        ) : (
          <>
            <div role="group" aria-label="Lọc đợt thanh toán" className="flex flex-wrap gap-2">
              {PAYMENT_FILTERS.map((option) => (
                <FilterPill
                  key={option}
                  active={filter === option}
                  aria-pressed={filter === option}
                  onClick={() => void setFilter(option === "can-tra" ? null : option)}
                >
                  {query.data && option !== "tat-ca"
                    ? `${PAYMENT_FILTER_LABEL[option]} (${formatNumber(count(option))})`
                    : PAYMENT_FILTER_LABEL[option]}
                </FilterPill>
              ))}
            </div>
            {query.isPending ? (
              <Skeleton
                role="status"
                aria-label="Đang tải"
                className="h-40 w-full rounded-[var(--r-lg)]"
              />
            ) : query.error && !query.data ? (
              <div className="space-y-3" role="alert">
                <Alert tone="warning" title="Không tải được các đợt thanh toán.">
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
            ) : rows.length === 0 ? (
              <p className="text-ink-secondary text-sm">{EMPTY[filter]}</p>
            ) : (
              <ul className="space-y-3" aria-label="Các đợt thanh toán">
                {rows.map((installment) => (
                  <MyInstallmentRow
                    key={installment.installmentId}
                    installment={installment}
                    withTransfer
                  />
                ))}
              </ul>
            )}
            {query.data && query.data.totalElements > all.length ? (
              <p className="text-ink-secondary text-xs">
                Đang hiển thị {formatNumber(all.length)} trên{" "}
                {formatNumber(query.data.totalElements)} đợt. Hãy chat với Sale nếu bạn không thấy
                một đợt cần tìm.
              </p>
            ) : null}
            {allowed ? <DebtReconciliationCard /> : null}
          </>
        )}
      </div>
    </>
  );
}
