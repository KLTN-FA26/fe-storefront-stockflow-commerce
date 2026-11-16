"use client";

import { useEffect } from "react";
import { notFound, useRouter } from "next/navigation";

import { Skeleton } from "@/components/shared";
import { STORE_ROUTES } from "@/constants";
import { useMyInvoiceOrder } from "@/lib/einvoices";

/** Anchor of the order page's invoices card (`OrderInvoicesCard`). */
export const INVOICES_ANCHOR = "order-invoices-heading";

/**
 * `/einvoices/{id}` — where the BE links the "hoá đơn đã phát hành" notification
 * (EInvoiceIssuedNotificationListener, EInvoiceErrorNoticeNotificationListener). The storefront
 * shows invoices on their order's page, so this finds the invoice's order among the customer's
 * invoices and replaces the URL with that page's invoices card. Unknown or another customer's
 * invoice: not found.
 */
export function EInvoiceLinkScreen({ id }: { id: string }) {
  const router = useRouter();
  const query = useMyInvoiceOrder(id);

  useEffect(() => {
    if (query.data) {
      router.replace(`${STORE_ROUTES.account.orders.detail(query.data)}#${INVOICES_ANCHOR}`);
    }
  }, [query.data, router]);

  if (query.isSuccess && query.data === null) notFound();
  if (query.isError) notFound();
  return (
    <Skeleton
      role="status"
      aria-label="Đang mở hoá đơn"
      className="h-40 w-full rounded-[var(--r-lg)]"
    />
  );
}
