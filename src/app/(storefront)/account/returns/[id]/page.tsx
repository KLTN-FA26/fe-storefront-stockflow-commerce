import { ReturnDetailScreen } from "@/features/returns";

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-5xl">
      <ReturnDetailScreen returnId={id} />
    </div>
  );
}
