"use client";

import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";

/** The header's account entry: the account when signed in, the login page otherwise. */
export function HeaderAccountLink({ className }: { className: string }) {
  const signedIn = useSignedIn();
  const Icon = signedIn === false ? LogIn : UserRound;
  const label = signedIn === false ? "Đăng nhập" : "Tài khoản";
  // The name is on the link itself (WCAG 2.4.4, 4.1.2): below `lg` only the icon shows.
  return (
    <Link
      href={signedIn === false ? APP_ROUTES.login : STORE_ROUTES.account.home}
      aria-label={label}
      className={className}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span aria-hidden="true" className="hidden lg:inline">
        {label}
      </span>
    </Link>
  );
}
