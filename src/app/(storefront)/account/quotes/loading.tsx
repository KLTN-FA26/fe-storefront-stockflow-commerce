import { QuoteListSkeleton } from "@/features/quote/components/quote-states";

export default function QuotesLoading() {
  return (
    <div className="max-w-5xl">
      <QuoteListSkeleton />
    </div>
  );
}
