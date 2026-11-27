import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import { installmentKeys, installmentShortName, type Installment } from "@/lib/installments";
import { formatMoney } from "@/lib/format/money";

import { orderKeys } from "./queries";

/**
 * How often an open order page asks again while money is due. Transfers are recorded by the bank
 * feed (SePay webhook) within seconds, so a customer who has just scanned the VietQR sees the
 * order move on without reloading. No websocket carries order or payment changes (only chat does),
 * so the page asks; a hidden tab does not.
 */
export const LIVE_PAYMENT_POLL_MS = 5_000;

/**
 * While `watching` (an installment is due now, or the order still waits for payment), re-reads the
 * order and its installments every {@link LIVE_PAYMENT_POLL_MS} while the tab is visible, and once
 * more when the customer comes back to it. When an installment seen unpaid on this page turns PAID,
 * says so: the money arrived. Nothing is said about installments already paid when the page opened.
 */
export function useLivePayment(
  orderId: string,
  watching: boolean,
  installments: readonly Installment[] | undefined,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!watching) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      void queryClient.invalidateQueries({ queryKey: installmentKeys.ofOrder(orderId) });
    };
    const timer = window.setInterval(refresh, LIVE_PAYMENT_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [watching, orderId, queryClient]);

  // The status each installment had the last time this page saw it.
  const seen = useRef<Map<string, Installment["status"]> | null>(null);
  useEffect(() => {
    if (!installments) return;
    const previous = seen.current;
    seen.current = new Map(installments.map((i) => [i.installmentId, i.status]));
    if (!previous) return;
    for (const installment of installments) {
      const before = previous.get(installment.installmentId);
      if (installment.status === "PAID" && before !== undefined && before !== "PAID") {
        toast.success(
          `Đã nhận thanh toán ${installmentShortName(installment)}`,
          `${formatMoney(installment.paidAmount)} đã được ghi nhận. Cảm ơn quý khách!`,
        );
      }
    }
  }, [installments]);
}
