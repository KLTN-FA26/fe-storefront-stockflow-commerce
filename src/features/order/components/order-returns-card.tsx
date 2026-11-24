"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { ToneBadge } from "@/components/storefront/tone-badge";
import { useHasPermission, useMyPermissions } from "@/lib/auth/my-permissions";
import { formatDate } from "@/lib/format/date";
import { returnStatusMeta, useMyOrderReturns } from "@/lib/returns";

import type { Order } from "../types";

const CARD =
  "rounded-[var(--r-lg)] border border-border-default bg-bg-surface p-[var(--card-pad)] shadow-[var(--card-shadow)]";
export const RETURNS_PERMISSION = "sales-rmas:READ";
/**
 * Chỉ đơn đã có lần giao mới có thể có yêu cầu trả hàng — kể cả đơn giữ một phần hàng, phần còn lại
 * đã về kho (`PARTIALLY_RETURNED`, WF-05 BE-35).
 */
const SHIPPED_STATES = new Set([
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "PARTIALLY_RETURNED",
  "RETURNED",
]);

/** Các yêu cầu trả hàng của đơn, mới nhất trước; mỗi cái dẫn tới trang theo dõi của nó. */
export function OrderReturnsCard({ order }: { order: Order }) {
  const permissions = useMyPermissions();
  const allowed =
    useHasPermission(RETURNS_PERMISSION) &&
    !permissions.isPending &&
    SHIPPED_STATES.has(order.deliveryState ?? "");
  const query = useMyOrderReturns(order.orderId, allowed);
  const returns = query.data ?? [];
  if (!allowed || returns.length === 0) return null;

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="order-returns-heading">
      <h2
        id="order-returns-heading"
        className="font-display text-ink-primary text-base font-semibold"
      >
        Trả hàng
      </h2>
      <ul className="space-y-2">
        {returns.map((request) => {
          const meta = returnStatusMeta(request);
          return (
            <li key={request.id}>
              <Link
                href={STORE_ROUTES.account.returns.detail(request.id)}
                className="hover:bg-bg-muted focus-visible:ring-accent -mx-2 flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-2 py-1.5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-ink-primary block font-mono text-sm font-semibold">
                    {request.rmaNumber}
                  </span>
                  <span className="text-ink-tertiary block text-xs tabular-nums">
                    {formatDate(request.requestedAt)}
                  </span>
                </span>
                <ToneBadge label={meta.label} tone={meta.tone} size="sm" />
                <ChevronRight aria-hidden className="text-ink-tertiary size-4 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
