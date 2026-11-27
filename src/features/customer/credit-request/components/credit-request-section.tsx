"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Alert, Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

import { isOpen } from "../lifecycle";
import { useMyCreditRequests } from "../queries";

import { CreditRequestDialog } from "./request-dialog";
import { CreditRequestStatusBadge } from "./status-badge";

/**
 * "Đề nghị cấp hạn mức" on the credit card (handoff A3; kltn-docs 18 §4.1 step 5): the customer's own requests, newest
 * first, and the button to ask — hidden while one is open, since a customer has at most one (BE
 * CREDIT_REQUEST_ALREADY_OPEN). Each row opens `/credit-requests/{id}`.
 */
export function CreditRequestSection({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const query = useMyCreditRequests(0, enabled);
  const [asking, setAsking] = useState(false);
  if (!enabled) return null;
  const items = query.data?.items ?? [];
  const open = items.some((request) => isOpen(request.status));

  return (
    <section
      aria-labelledby="credit-requests-heading"
      className="border-border-default space-y-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="credit-requests-heading" className="text-ink-primary text-sm font-semibold">
          Đề nghị cấp hạn mức
        </h3>
        {query.isSuccess && !open ? (
          <Button className="min-h-11 rounded-[var(--r-md)] px-4" onClick={() => setAsking(true)}>
            Gửi đề nghị cấp hạn mức
          </Button>
        ) : null}
      </div>
      {query.isPending ? <Skeleton className="h-16 w-full rounded-[var(--r-md)]" /> : null}
      {query.isError ? (
        <Alert tone="warning">Không tải được đề nghị của bạn. Vui lòng tải lại trang.</Alert>
      ) : null}
      {query.isSuccess && items.length === 0 ? (
        <p className="text-ink-secondary text-sm">
          Cần hạn mức cao hơn hoặc kỳ hạn dài hơn? Gửi đề nghị để Sale và kế toán xem xét.
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-border-default divide-y">
          {items.map((request) => (
            <li key={request.id}>
              <Link
                href={STORE_ROUTES.account.creditRequest(request.id)}
                className="hover:bg-bg-muted flex min-h-11 items-center gap-3 rounded-[var(--r-sm)] px-1 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink-primary text-sm font-semibold tabular-nums">
                    {formatMoney(request.requestedLimit, request.currency)} ·{" "}
                    {request.requestedTermDays} ngày
                  </p>
                  <p className="text-ink-tertiary text-xs">
                    Gửi ngày {formatDate(request.submittedAt)}
                  </p>
                </div>
                <CreditRequestStatusBadge status={request.status} />
                <ChevronRight aria-hidden className="text-ink-tertiary size-4" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <CreditRequestDialog
        open={asking}
        onOpenChange={setAsking}
        onDone={(created) => {
          setAsking(false);
          router.push(STORE_ROUTES.account.creditRequest(created.id));
        }}
      />
    </section>
  );
}
