"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutCustomer } from "@/lib/auth/customer-session";
import { cn } from "@/lib/cn";

/** Ends the session at the BE, drops the token, the cached data and the cart, then to /login. */
export function LogoutButton({ className }: { className?: string | undefined }) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      className={cn("min-h-11 justify-start gap-2.5 rounded-[var(--r-md)] px-3", className)}
      onClick={async () => {
        setPending(true);
        await signOutCustomer();
        // A full load: nothing of the last customer's page may stay mounted.
        window.location.replace("/login");
      }}
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? "Đang đăng xuất..." : "Đăng xuất"}
    </Button>
  );
}
