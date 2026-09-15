import { getDesign } from "@/features/product-design";
import { DesignEditor } from "@/features/product-design/components/design-editor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DesignEditorPage({ params }: PageProps) {
  const { id } = await params;
  const design = await getDesign(id);

  return <DesignEditor design={design} />;
}
