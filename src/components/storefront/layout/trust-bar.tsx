import { SurfaceCard } from "./surface-card";
import { defaultTrustItems, type TrustItem } from "./trust-items";

type TrustBarProps = {
  items?: TrustItem[] | undefined;
  variant?: "plain" | "card" | undefined;
};

export function TrustBar({ items = defaultTrustItems, variant = "plain" }: TrustBarProps) {
  const list = (
    <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, desc }) => (
        <li key={title} className="flex items-start gap-3">
          <span className="bg-bg-subtle text-accent flex size-10 shrink-0 items-center justify-center rounded-full">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-ink-primary text-sm font-semibold">{title}</p>
            <p className="text-ink-secondary text-xs">{desc}</p>
          </div>
        </li>
      ))}
    </ul>
  );
  return variant === "card" ? <SurfaceCard>{list}</SurfaceCard> : list;
}
