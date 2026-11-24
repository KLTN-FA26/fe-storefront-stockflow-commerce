import { SessionGuard } from "@/features/auth/components/session-guard";

import { StorefrontShell } from "@/components/storefront/storefront-shell";

import type { ReactNode } from "react";

/**
 * The customer's account area (`/account/*`): the storefront header over the account rail and page, with no footer,
 * like the back office. Its own group beside `(storefront)` only to drop the footer; same session guard.
 */
export default function AccountGroupLayout({ children }: { children: ReactNode }) {
  return (
    <StorefrontShell footer={false}>
      <SessionGuard>{children}</SessionGuard>
    </StorefrontShell>
  );
}
