"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutCustomer } from "@/lib/auth/customer-session";
import { cn } from "@/lib/cn";

/**
 * Ends the session at the BE, drops the token, the cached data and the cart, then to /login. `iconOnly`: just the icon
 * (a square 44px target, named for assistive technology), as at the foot of the account rail.
 */
export function LogoutButton({
  className,
  iconOnly = false,
}: {
  className?: string | undefined;
  iconOnly?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const label = pending ? "Đang đăng xuất..." : "Đăng xuất";
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={cn(
        iconOnly
          ? "size-11 rounded-[var(--r-md)] p-0"
          : "min-h-11 justify-start gap-2.5 rounded-[var(--r-md)] px-3",
        className,
      )}
      onClick={async () => {
        setPending(true);
        await signOutCustomer();
        // A full load: nothing of the last customer's page may stay mounted.
        window.location.replace("/login");
      }}
    >
      <LogOut aria-hidden className="size-4" />
      {iconOnly ? null : label}
    </Button>
  );
}
