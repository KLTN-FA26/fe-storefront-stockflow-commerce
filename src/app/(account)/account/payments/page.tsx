import { Suspense } from "react";

import { Skeleton } from "@/components/shared";
import { PaymentsScreen } from "@/features/customer/installments";

export default function PaymentsPage() {
  return (
    <div>
      {/* nuqs reads search params (the filter): Suspense keeps the rest of the route static. */}
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-[var(--r-lg)]" />}>
        <PaymentsScreen />
      </Suspense>
    </div>
  );
}
