import { Suspense } from "react";

import { ReturnListSkeleton, ReturnsScreen } from "@/features/returns";

export default function ReturnsPage() {
  return (
    <div>
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<ReturnListSkeleton />}>
        <ReturnsScreen />
      </Suspense>
    </div>
  );
}
