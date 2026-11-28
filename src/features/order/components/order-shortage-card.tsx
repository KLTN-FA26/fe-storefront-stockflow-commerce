"use client";

import { useState } from "react";

import { ShortageChoicePanel } from "@/components/storefront/shortage-choice-panel";
import { STORE_ROUTES } from "@/constants";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { shortageCardName, shortageStatusMeta, shortageTitle } from "@/lib/domain/shortage";
import { ToneBadge } from "@/components/storefront/tone-badge";

import { describeShortageError } from "../errors";
import { useChooseShortage } from "../mutations";
import { useShortageCard } from "../queries";

/** Where the order page leads the "Chọn hướng xử lý thiếu thùng" step. */
export const SHORTAGE_SECTION_ID = "thieu-thung";

/**
 * "Thiếu thùng" on the order page (kltn-docs 17 §5.2, §4.14 step 57): the card still waiting on this order - the same
 * content and the same choice as in the chat - plus the way back to the chat with Sales. Nothing when the order has no
 * live card (executed, replaced and ended cards live on in the chat only).
 */
export function OrderShortageCard({ orderId }: { orderId: string }) {
  const { data: card } = useShortageCard(orderId);
  const choose = useChooseShortage(orderId);
  const mayChoose = useHasPermission("sales-orders:UPDATE");
  const [error, setError] = useState<string | null>(null);
  if (!card) return null;
  const status = shortageStatusMeta(card.status);

  return (
    <section
      id={SHORTAGE_SECTION_ID}
      aria-labelledby="order-shortage-heading"
      className="border-border-default bg-bg-surface scroll-mt-[var(--sticky-top)] space-y-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink-tertiary text-xs font-medium">{shortageCardName(card)}</p>
          <h2
            id="order-shortage-heading"
            className="font-display text-ink-primary text-base font-semibold"
          >
            {shortageTitle(card)}
          </h2>
        </div>
        <ToneBadge label={status.label} tone={status.tone} size="sm" className="shrink-0" />
      </div>
      <ShortageChoicePanel
        card={card}
        canChoose={mayChoose}
        pending={choose.isPending}
        error={error}
        onClearError={() => setError(null)}
        chatHref={STORE_ROUTES.chat.about("ORDER", card.orderId)}
        onChoose={({ option, note }, onDone) => {
          setError(null);
          choose.mutate(
            {
              cardId: card.cardId,
              input: { option, version: card.version, ...(note ? { note } : {}) },
            },
            { onSuccess: onDone, onError: (failure) => setError(describeShortageError(failure)) },
          );
        }}
      />
    </section>
  );
}
