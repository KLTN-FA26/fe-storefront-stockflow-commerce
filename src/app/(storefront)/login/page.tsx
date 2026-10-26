import { Suspense } from "react";

import { LoginScreen } from "@/features/auth/components/login-screen";

import { PageShell } from "@/components/storefront/layout";

export default function LoginPage() {
  return (
    <PageShell width="narrow">
      {/* nuqs reads ?next: Suspense keeps the rest of the route static. */}
      <Suspense>
        <LoginScreen />
      </Suspense>
    </PageShell>
  );
}
