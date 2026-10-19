"use client";

import Link from "next/link";
import { LogIn, UserRound } from "lucide-react";

import { APP_ROUTES, STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";

/** The header's account entry: the account when signed in, the login page otherwise. */
export function HeaderAccountLink({ className }: { className: string }) {
  const signedIn = useSignedIn();
  const Icon = signedIn === false ? LogIn : UserRound;
  return (
    <Link
      href={signedIn === false ? APP_ROUTES.login : STORE_ROUTES.account.home}
      className={className}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">
        {signedIn === false ? "Đăng nhập" : "Tài khoản"}
      </span>
    </Link>
  );
}
