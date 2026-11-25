import { AuthSplit } from "@/components/storefront/auth/auth-split";

import type { ReactNode } from "react";

/** `/login` and `/portal/activate` stand on their own, outside the shop's header and footer (`(storefront)`). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthSplit>{children}</AuthSplit>;
}
