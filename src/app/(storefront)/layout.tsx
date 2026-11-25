import { SessionGuard } from "@/features/auth/components/session-guard";

import { StorefrontShell } from "@/components/storefront/storefront-shell";

import type { ReactNode } from "react";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <StorefrontShell>
      <SessionGuard>{children}</SessionGuard>
    </StorefrontShell>
  );
}
