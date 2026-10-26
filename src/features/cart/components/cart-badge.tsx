"use client";

import { useEffect } from "react";

import { useHydrated } from "@/hooks/use-hydrated";
import { useAuthStore } from "@/lib/auth/auth-store";
import { selectLineCount, useCartStore } from "@/lib/store/use-cart-store";

/**
 * Number of lines in the cart, on the header's cart icon. Also tells the cart which customer is
 * signed in (sign-in binds it too, this covers a session restored from storage), so one customer
 * never inherits another's lines on a shared browser.
 */
export function CartBadge() {
  const hydrated = useHydrated();
  const count = useCartStore(selectLineCount);
  // The cart belongs to the customer profile (the account that places orders), not the login.
  const ownerId = useAuthStore((state) => state.user?.customerId ?? state.user?.userId);
  const bindOwner = useCartStore((state) => state.bindOwner);

  useEffect(() => {
    if (ownerId) bindOwner(ownerId);
  }, [ownerId, bindOwner]);

  if (!hydrated || count === 0) return null;
  return (
    <span className="bg-accent text-ink-inverse absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs leading-none font-bold tabular-nums">
      {count}
      <span className="sr-only"> dòng sản phẩm trong giỏ</span>
    </span>
  );
}
