"use client";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { UNSELLABLE_QUOTE_NOTICE } from "@/lib/domain/quote-purchasability";

interface QuoteUnsellableNoticeProps {
  /** The BE's own words when it refused the acceptance with SKU_NOT_SELLABLE, if it did. */
  refusal?: string | undefined;
  pending: boolean;
  /** Absent when the customer may not answer the quote: the notice then only explains. */
  onRequestChanges?: (() => void) | undefined;
}

/**
 * A SENT quote with a line that can no longer be bought (WF-02 FE-1): accepting is blocked, asking
 * Sale to revise it stays open. Shown in place of the acceptance form, so a refusal that re-read
 * the quote into this state is said here too.
 */
export function QuoteUnsellableNotice({
  refusal,
  pending,
  onRequestChanges,
}: QuoteUnsellableNoticeProps) {
  return (
    <section aria-label="Báo giá có sản phẩm đã ngừng bán" className="space-y-3">
      <Alert tone="warning">{UNSELLABLE_QUOTE_NOTICE}</Alert>
      {refusal ? (
        <p role="alert" className="text-ink-secondary text-sm">
          {refusal}
        </p>
      ) : null}
      {onRequestChanges ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-4"
          disabled={pending}
          onClick={onRequestChanges}
        >
          Yêu cầu sửa
        </Button>
      ) : null}
    </section>
  );
}
