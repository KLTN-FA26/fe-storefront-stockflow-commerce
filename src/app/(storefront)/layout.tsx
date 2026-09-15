import { StorefrontShell } from "@/components/storefront/storefront-shell";

import type { ReactNode } from "react";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>;
}
