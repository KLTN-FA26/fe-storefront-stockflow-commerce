"use client";

import { ProjectScreen } from "@/features/product-design/components/project-screen";
import type { FontRegistry } from "@/features/product-design/engine";

import { useDesignableCatalogue } from "../../designable-products";

/**
 * The studio's text fonts, imported when "Xem 3D" is first used: the 3D picture draws the design's
 * text, and next/font's eight families must not weigh on the project page itself.
 */
const loadFonts = (): Promise<FontRegistry> =>
  import("@/app/(studio)/design/fonts").then((mod) => mod.STUDIO_FONTS);

/** The catalogue is read here (the design feature does not know it), as on `/design`. */
export function ProjectWithCatalog({ projectId }: { projectId: string }) {
  const catalogue = useDesignableCatalogue();
  return <ProjectScreen projectId={projectId} catalogue={catalogue} loadFonts={loadFonts} />;
}
