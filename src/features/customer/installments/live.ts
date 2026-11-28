import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/shared/Toast";
import { formatMoney } from "@/lib/format/money";
import {
  installmentKeys,
  installmentShortName,
  isDueNow,
  type Installment,
} from "@/lib/installments";

/**
 * How often the "Thanh toán" page asks again while money is due: the bank feed (SePay webhook)
 * records a transfer within seconds, the same pace as the order page.
 */
export const PAYMENTS_POLL_MS = 5_000;

/**
 * While an installment is due now, re-reads the customer's installments (and an open transfer
 * panel, under the same root) every {@link PAYMENTS_POLL_MS} while the tab is visible, and once
 * more when the customer comes back to it. An installment seen owing on this page that turns PAID
 * is announced: the money arrived. Nothing is said about installments already paid on arrival.
 */
export function useLivePayments(installments: readonly Installment[] | undefined) {
  const queryClient = useQueryClient();
  const watching = (installments ?? []).some((installment) => isDueNow(installment));

  useEffect(() => {
    if (!watching) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({ queryKey: installmentKeys.all });
    };
    const timer = window.setInterval(refresh, PAYMENTS_POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [watching, queryClient]);

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
          `${formatMoney(installment.paidAmount, installment.currency)} của đơn ${installment.orderNumber} đã được ghi nhận. Cảm ơn quý khách!`,
        );
      }
    }
  }, [installments]);
}
