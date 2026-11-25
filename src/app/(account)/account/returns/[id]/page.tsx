import { ReturnDetailScreen } from "@/features/returns";

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <ReturnDetailScreen returnId={id} />
    </div>
  );
}
