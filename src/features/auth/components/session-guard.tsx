"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { APP_ROUTES } from "@/constants";
import { loginUrl } from "@/lib/auth/safe-next";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import type { ReactNode } from "react";

/**
 * Pages a visitor sees without signing in: the home page, and the request for a business account (a business that is
 * not a customer has no login). The catalog, prices and stock are for customers.
 */
const PUBLIC_PATHS: ReadonlySet<string> = new Set([APP_ROUTES.home, APP_ROUTES.openAccount]);

/**
 * The gate in front of every customer page: a visitor who is not signed in is sent to `/login?next=<this page>` (the
 * URL changes, and signing in brings them back), instead of each screen drawing its own "sign in to see this" box
 * under the address of the page they wanted. The session lives in the browser (localStorage), so the server cannot
 * tell: nothing is shown until the client knows. Mock mode answers every call, so it counts as signed in.
 */
export function SessionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const signedIn = useSignedIn();
  const open = PUBLIC_PATHS.has(pathname) || /^\/xac-minh-hop-dong\/[^/]+\/?$/.test(pathname);

  useEffect(() => {
    if (open || signedIn !== false) return;
    router.replace(loginUrl(`${window.location.pathname}${window.location.search}`));
  }, [open, signedIn, router]);

  if (open || signedIn) return children;
  return null;
}
