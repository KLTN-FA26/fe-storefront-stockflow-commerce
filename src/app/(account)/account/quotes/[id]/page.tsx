import { QuoteDetailScreen } from "@/features/quote/components/quote-detail-screen";

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <QuoteDetailScreen quoteId={id} />
    </div>
  );
}
