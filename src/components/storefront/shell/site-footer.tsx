import Link from "next/link";

import { BRAND } from "@/constants";
import { cn } from "@/lib/cn";

import { TrustBar } from "@/components/storefront/layout";

import { footerColumns, paymentMethods } from "./nav-config";

const container = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";
const focusRing =
  "focus-visible:ring-accent rounded-sm focus-visible:ring-2 focus-visible:outline-none";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border-default bg-bg-surface border-t">
      <div className={cn(container, "border-border-default border-b py-6")}>
        <TrustBar />
      </div>

      <div
        className={cn(
          container,
          "grid grid-cols-2 gap-x-6 gap-y-8 py-8 lg:grid-cols-[1.4fr_repeat(4,1fr)]",
        )}
      >
        <div className="col-span-2 space-y-3 lg:col-span-1">
          <Link href="/" className={cn("font-display text-xl font-bold tracking-tight", focusRing)}>
            <span>{BRAND.wordmark.primary}</span>
            <span className="text-accent">{BRAND.wordmark.accent}</span>
          </Link>
          <p className="text-ink-secondary max-w-sm text-sm">
            Storefront TMĐT cho sản phẩm in ấn, thiết kế cá nhân hóa và theo dõi đơn hàng trong một
            trải nghiệm mobile-first.
          </p>
        </div>
        {footerColumns.map((column) => (
          <div key={column.title} className="space-y-1">
            <h2 className="text-ink-primary text-sm font-semibold">{column.title}</h2>
            <ul className="text-ink-secondary text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className={cn(
                      "hover:text-accent inline-flex min-h-11 items-center transition-colors",
                      focusRing,
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-border-default border-t">
        <div
          className={cn(
            container,
            "flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p className="text-ink-tertiary text-xs">
            © {year} {BRAND.name}
          </p>
          <ul aria-label="Phương thức thanh toán" className="flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <li
                key={method}
                className="border-border-default text-ink-secondary rounded-full border px-2.5 py-1 text-xs font-medium"
              >
                {method}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
