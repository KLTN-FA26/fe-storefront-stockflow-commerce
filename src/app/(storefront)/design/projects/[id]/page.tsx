import { ProjectWithCatalog } from "./project-with-catalog";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dự án thiết kế" };

export default async function DesignProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectWithCatalog projectId={id} />;
}
