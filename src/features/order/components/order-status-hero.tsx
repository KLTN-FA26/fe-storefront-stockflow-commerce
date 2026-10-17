import { cn } from "cn";
import {
  BadgeCheck,
  CircleCheck,
  CircleX,
  CreditCard,
  Factory,
  Hourglass,
  Package,
  PauseCircle,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { ORDER_STATUS_GROUP_META, orderProgressOf } from "../lifecycle";
import type { OrderStatusGroup } from "../types";
import { ORDER_TONE_CLASSES } from "./order-status-badge";
import { OrderStepper } from "./order-stepper";

const GROUP_ICON: Record<OrderStatusGroup, LucideIcon> = {
  AWAITING_PAYMENT: CreditCard,
  UNDER_REVIEW: PauseCircle,
  CONFIRMED: BadgeCheck,
  IN_PRODUCTION: Factory,
  PREPARING: Package,
  SHIPPING: Truck,
  DELIVERED: CircleCheck,
  CANCELLED: CircleX,
  RETURNED: Undo2,
  UNKNOWN: Hourglass,
};

/** One place that says where the order is and what happens next, replacing badge + progress bar. */
export function OrderStatusHero({ group }: { group: OrderStatusGroup }) {
  const { label, tone, hint } = ORDER_STATUS_GROUP_META[group];
  const Icon = GROUP_ICON[group];
  const done = orderProgressOf(group);

  return (
    <section
      aria-labelledby="order-status-heading"
      className="bg-bg-surface border-border-default space-y-5 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            ORDER_TONE_CLASSES[tone],
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="order-status-heading" className="font-display text-ink-primary text-lg font-bold">
            {label}
          </h2>
          <p className="text-ink-secondary mt-0.5 text-sm">{hint}</p>
        </div>
      </div>
      {done !== null && <OrderStepper done={done} />}
    </section>
  );
}
