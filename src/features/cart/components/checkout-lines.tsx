import Link from "next/link";

import { STORE_ROUTES } from "@/constants";
import { SurfaceCard } from "@/components/storefront/layout";
import { formatMoney } from "@/lib/format/money";

import type { CartViewLine } from "../selectors";

/** The lines being ordered, read-only: quantities are edited in the cart. */
export function CheckoutLines({ lines }: { lines: CartViewLine[] }) {
  return (
    <SurfaceCard padded={false}>
      <div className="border-border-default flex items-center justify-between gap-3 border-b p-[var(--card-pad)]">
        <h2 className="font-display text-ink-primary text-lg font-bold">Hàng đặt</h2>
        <Link
          href={STORE_ROUTES.cart}
          className="text-accent focus-visible:ring-accent inline-flex min-h-11 items-center rounded-[var(--r-md)] text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          Sửa giỏ hàng
        </Link>
      </div>
      <ul className="divide-border-default divide-y">
        {lines.map(({ line, unitPrice, lineTotal }) => (
          <li key={line.sku} className="flex items-start justify-between gap-4 p-[var(--card-pad)]">
            <div className="min-w-0">
              <p className="text-ink-primary line-clamp-2 text-sm font-semibold">{line.title}</p>
              <p className="text-ink-secondary font-mono text-xs break-all">{line.sku}</p>
              <p className="text-ink-secondary mt-1 text-sm tabular-nums">
                {typeof unitPrice === "number" ? formatMoney(unitPrice) : "—"} × {line.quantity}
              </p>
            </div>
            <p className="text-ink-primary shrink-0 font-semibold tabular-nums">
              {typeof lineTotal === "number" ? formatMoney(lineTotal) : "—"}
            </p>
          </li>
        ))}
      </ul>
    </SurfaceCard>
  );
}
