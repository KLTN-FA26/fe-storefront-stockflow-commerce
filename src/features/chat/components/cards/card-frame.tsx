import type { ReactNode } from "react";

import { formatMoney } from "@/lib/format/money";
import type { Currency } from "@/lib/domain/types";
import { cn } from "@/lib/cn";

import { ToneBadge } from "@/components/storefront/tone-badge";

import type { StatusMeta } from "../../labels";

interface CardFrameProps {
  /** What kind of document, e.g. "Báo giá". */
  eyebrow: string;
  title: string;
  /** A document number (mono, the default) or a name in plain text. */
  titleMono?: boolean;
  status?: StatusMeta | null | undefined;
  children: ReactNode;
  footer?: ReactNode;
}

/** The shell every chat card shares: kind, name and status on top, actions at the bottom. */
export function CardFrame({
  eyebrow,
  title,
  titleMono = true,
  status,
  children,
  footer,
}: CardFrameProps) {
  return (
    <section
      aria-label={`${eyebrow}: ${title}`}
      className="border-border-default bg-bg-surface w-full max-w-md rounded-[var(--r-lg)] border shadow-[var(--card-shadow)]"
    >
      <header className="border-border-default flex items-start justify-between gap-3 border-b px-[var(--card-pad)] py-3">
        <div className="min-w-0">
          <p className="text-ink-tertiary text-xs font-medium">{eyebrow}</p>
          <h3
            className={cn(
              "text-ink-primary font-semibold break-words",
              titleMono && "font-mono tabular-nums",
            )}
          >
            {title}
          </h3>
        </div>
        {status ? (
          <ToneBadge label={status.label} tone={status.tone} size="sm" className="shrink-0" />
        ) : null}
      </header>
      <div className="space-y-3 p-[var(--card-pad)] text-sm">{children}</div>
      {footer ? (
        <div className="border-border-default bg-bg-subtle flex flex-wrap items-center gap-2 rounded-b-[var(--r-lg)] border-t px-[var(--card-pad)] py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="space-y-1.5">{children}</dl>;
}

export function Fact({
  label,
  children,
  numeric = false,
}: {
  label: string;
  children: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-ink-secondary shrink-0">{label}</dt>
      <dd className={cn("text-ink-primary text-right font-medium", numeric && "tabular-nums")}>
        {children}
      </dd>
    </div>
  );
}

const asCurrency = (currency: string | null | undefined): Currency =>
  currency === "USD" || currency === "CNY" ? currency : "VND";

/** Money of a card payload, in the payload's currency (VND unless it says otherwise). */
export const cardMoney = (amount: number, currency?: string | null) =>
  formatMoney(amount, asCurrency(currency));

/** A secondary action of a card, as a link-styled 44px target. */
export const CARD_LINK =
  "text-accent hover:bg-bg-subtle focus-visible:ring-accent inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r-md)] px-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none";
