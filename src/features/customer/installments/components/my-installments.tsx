"use client";

import { useEffect } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import { useQueryState } from "nuqs";

import { Alert, Skeleton } from "@/components/shared";
import { ListPagination } from "@/components/storefront/list-pagination";
import { SurfaceCard } from "@/components/storefront/layout";
import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { useMyInstallments } from "@/lib/installments";

import {
  INSTALLMENT_FILTERS,
  INSTALLMENT_FILTER_LABEL,
  MY_INSTALLMENTS_PAGE_SIZE,
  filterToStatus,
  installmentFilterParser,
  installmentPageParser,
} from "../filters";
import { MyInstallmentRow } from "./my-installment-row";

/** The permission that lets a customer read their installments (BE GET /installments/me, scope OWN). */
export const INSTALLMENTS_PERMISSION = "payment-installments:READ";

/**
 * Every installment of the customer's signed contracts (kltn-docs 15 §4.3 "công nợ phải thu", 18 §2),
 * earliest due first as the BE sorts them, filtered by status in the URL. Shown only to an account
 * holding `payment-installments:READ`; the BE re-checks on every call.
 */
export function MyInstallments() {
  const signedIn = useSignedIn();
  // Nothing is asked or shown until the permission list is known: a customer without the permission
  // never sees the section flash.
  const permissions = useMyPermissions();
  const allowed = useHasPermission(INSTALLMENTS_PERMISSION) && !permissions.isPending;
  const [filter, setFilter] = useQueryState("dotTT", installmentFilterParser);
  const [urlPage, setPage] = useQueryState("dotTrang", installmentPageParser);
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const status = filterToStatus(filter);
  const query = useMyInstallments(
    {
      page: page - 1,
      size: MY_INSTALLMENTS_PAGE_SIZE,
      ...(status ? { status } : {}),
    },
    signedIn === true && allowed,
  );
  const { data, isPlaceholderData } = query;

  // An out-of-range page in the URL comes back to a real one.
  useEffect(() => {
    if (urlPage !== page) void setPage(page, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setPage(Math.max(data.totalPages, 1), { history: "replace" });
    }
  }, [urlPage, page, data, isPlaceholderData, setPage]);

  if (!allowed) return null;

  return (
    <SurfaceCard className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarClock aria-hidden className="text-accent size-5" />
        <h2 className="font-display text-ink-primary text-lg font-bold">Lịch thanh toán của tôi</h2>
      </div>
      <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
        {INSTALLMENT_FILTERS.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={filter === option ? "default" : "outline"}
            aria-pressed={filter === option}
            className="min-h-11 rounded-full px-4"
            onClick={() => {
              // A new filter starts from its first page.
              void setPage(null);
              void setFilter(option === "ALL" ? null : option);
            }}
          >
            {INSTALLMENT_FILTER_LABEL[option]}
          </Button>
        ))}
      </div>
      {query.isPending ? (
        <Skeleton
          role="status"
          aria-label="Đang tải"
          className="h-32 w-full rounded-[var(--r-md)]"
        />
      ) : query.error && !data ? (
        <div className="space-y-3" role="alert">
          <Alert tone="warning" title="Không tải được lịch thanh toán.">
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
      ) : data && data.items.length === 0 ? (
        <p className="text-ink-secondary text-sm">
          {filter === "ALL"
            ? "Bạn chưa có đợt thanh toán nào. Lịch thanh toán xuất hiện khi hợp đồng mua bán được ký."
            : `Không có đợt thanh toán nào ở trạng thái “${INSTALLMENT_FILTER_LABEL[filter]}”.`}
        </p>
      ) : data ? (
        <>
          <ul className="space-y-3" aria-label="Các đợt thanh toán">
            {data.items.map((installment) => (
              <MyInstallmentRow key={installment.installmentId} installment={installment} />
            ))}
          </ul>
          <ListPagination
            label="Phân trang lịch thanh toán"
            page={data.page + 1}
            totalPages={data.totalPages}
            hasPrevious={data.hasPrevious}
            hasNext={data.hasNext}
            busy={query.isFetching}
            onPageChange={(next) => void setPage(next)}
          />
        </>
      ) : null}
    </SurfaceCard>
  );
}
