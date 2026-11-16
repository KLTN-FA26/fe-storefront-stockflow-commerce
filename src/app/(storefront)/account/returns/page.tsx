import { Suspense } from "react";

import { ReturnListSkeleton, ReturnsScreen } from "@/features/returns";

export default function ReturnsPage() {
  return (
    <div className="max-w-5xl">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<ReturnListSkeleton />}>
        <ReturnsScreen />
      </Suspense>
    </div>
  );
}
