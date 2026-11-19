import { QuoteDetailSkeleton } from "@/features/quote/components/quote-states";

export default function QuoteDetailLoading() {
  return (
    <div className="max-w-5xl">
      <QuoteDetailSkeleton />
    </div>
  );
}
