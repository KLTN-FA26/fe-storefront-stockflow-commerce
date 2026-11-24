import { Suspense } from "react";

import { LoginScreen } from "@/features/auth/components/login-screen";

export default function LoginPage() {
  return (
    // nuqs reads ?next: Suspense keeps the rest of the route static.
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
