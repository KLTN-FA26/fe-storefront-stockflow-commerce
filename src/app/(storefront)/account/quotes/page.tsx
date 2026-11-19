import { Suspense } from "react";

import { QuotesScreen } from "@/features/quote/components/quotes-screen";
import { QuoteListSkeleton } from "@/features/quote/components/quote-states";

export default function QuotesPage() {
  return (
    <div className="max-w-5xl">
      {/* nuqs reads search params: Suspense keeps the rest of the route static. */}
      <Suspense fallback={<QuoteListSkeleton />}>
        <QuotesScreen />
      </Suspense>
    </div>
  );
}
