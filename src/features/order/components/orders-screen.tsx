"use client";

import { useEffect } from "react";
import { parseAsInteger, useQueryState } from "nuqs";

import { STORE_ROUTES } from "@/constants";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { OrderCard } from "@/components/storefront/order-card";
import { formatDate } from "@/lib/format/date";

import { ORDER_STATUS_META } from "../lifecycle";
import { ORDER_PAGE_SIZE, useMyOrders } from "../queries";
import type { Order } from "../types";
import { OrderStatusBadge } from "./order-status-badge";
import {
  NoOrdersYet,
  OrderListSkeleton,
  OrderLoadError,
  OrderStaleNotice,
  OrderWaitingNotice,
} from "./order-states";
import { OrdersPagination } from "./orders-pagination";

/**
 * First line by SKU (the BE has no product name yet) plus how many more lines the order has.
 * Wording: a "mặt hàng" is an order line (one SKU), a "sản phẩm" is one unit — same as the detail.
 */
function OrderLinesPreview({ order }: { order: Order }) {
  const [first, ...rest] = order.lines;
  if (!first) return null;
  return (
    <p className="min-w-0">
      <span className="font-mono text-sm font-semibold break-all">{first.sku}</span>
      <span className="text-ink-secondary text-sm tabular-nums"> × {first.quantity}</span>
      {rest.length > 0 && (
        <span className="text-ink-secondary block text-sm">và {rest.length} mặt hàng khác</span>
      )}
    </p>
  );
}

const pageParser = parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true });

export function OrdersScreen() {
  const [urlPage, setPage] = useQueryState("page", pageParser);
  // Never send page < 0 to the BE, whatever the URL says.
  const page = Number.isInteger(urlPage) && urlPage >= 1 ? urlPage : 1;
  const { data, isPending, isPaused, isFetching, isPlaceholderData, error, refetch } = useMyOrders({
    page,
    size: ORDER_PAGE_SIZE,
  });

  // Bring an out-of-range URL page back to a real one (replace, so Back skips the bad URL).
  useEffect(() => {
    if (urlPage !== page) void setPage(page, { history: "replace" });
    else if (data && !isPlaceholderData && page > Math.max(data.totalPages, 1)) {
      void setPage(Math.max(data.totalPages, 1), { history: "replace" });
    }
  }, [urlPage, page, data, isPlaceholderData, setPage]);

  return (
    <>
      <PageHeader title="Đơn hàng của tôi" subtitle="Theo dõi trạng thái và giao hàng." />
      <div className="mt-8 space-y-6">
        {/* isPending, not isLoading: a paused fetch (offline, hidden tab) has no data and no error
            yet, and must not fall through to the "no orders" empty state. */}
        {isPending ? (
          <>
            {isPaused && <OrderWaitingNotice />}
            <OrderListSkeleton />
          </>
        ) : error && !data ? (
          <div className="space-y-3">
            <OrderLoadError
              title="Không tải được danh sách đơn hàng"
              error={error}
              onRetry={() => void refetch()}
              retrying={isFetching}
            />
            {/* placeholderData only covers a pending page; once page N fails the pagination is
                gone, so offer the way back explicitly. */}
            {page > 1 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-full px-4"
                onClick={() => void setPage(1)}
              >
                Về trang đầu
              </Button>
            )}
          </div>
        ) : !data || data.totalElements === 0 ? (
          <NoOrdersYet />
        ) : (
          <>
            {error && (
              <OrderStaleNotice error={error} onRetry={() => void refetch()} retrying={isFetching} />
            )}
            <ul className="space-y-4" aria-busy={isPlaceholderData}>
              {data.items.map((order) => (
                <li key={order.orderId}>
                  <OrderCard
                    href={STORE_ROUTES.account.orders.detail(order.orderId)}
                    orderCode={order.orderNumber}
                    status={order.status}
                    statusBadge={<OrderStatusBadge status={order.status} />}
                    itemCount={order.lines.length}
                    total={order.totalAmount}
                    currency={order.currency}
                    createdAt={formatDate(order.placedAt)}
                    preview={<OrderLinesPreview order={order} />}
                    hint={ORDER_STATUS_META[order.status].hint}
                  />
                </li>
              ))}
            </ul>
            <OrdersPagination
              page={data.page}
              totalPages={data.totalPages}
              hasPrevious={data.hasPrevious}
              hasNext={data.hasNext}
              busy={isPlaceholderData}
              onPageChange={(next) => void setPage(next)}
            />
          </>
        )}
      </div>
    </>
  );
}
