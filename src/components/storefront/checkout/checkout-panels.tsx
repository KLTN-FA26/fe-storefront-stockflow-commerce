import type { ReactNode } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";

type CheckoutStepHeadingProps = {
  /** Leading marker: a step number bubble or an icon. */
  marker: ReactNode;
  title: string;
};

export function CheckoutStepHeading({ marker, title }: CheckoutStepHeadingProps) {
  return (
    <div className="flex items-center gap-2">
      {marker}
      <h2 className="font-display text-ink-primary text-lg font-bold sm:text-xl">{title}</h2>
    </div>
  );
}

/** Static bank transfer instructions shown when the customer picks "Chuyển khoản". */
export function BankTransferDetails() {
  return (
    <div className="border-border-default bg-bg-subtle rounded-[var(--r-md)] border p-[var(--card-pad)] text-sm">
      <p className="text-ink-primary font-semibold">Thông tin chuyển khoản</p>
      <dl className="text-ink-secondary mt-3 grid gap-2">
        <div className="flex justify-between gap-3">
          <dt>Ngân hàng</dt>
          <dd className="text-ink-primary font-medium">StockFlow Bank</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Chủ tài khoản</dt>
          <dd className="text-ink-primary font-medium">STOCKFLOW COMMERCE</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Nội dung</dt>
          <dd className="text-ink-primary font-mono font-medium">SO-2026-001</dd>
        </div>
      </dl>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-3 min-h-11 rounded-[var(--r-md)]"
      >
        <Copy className="h-4 w-4" /> Sao chép nội dung
      </Button>
    </div>
  );
}
