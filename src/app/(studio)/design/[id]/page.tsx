import { STUDIO_FONTS } from "../fonts";
import { DesignStudioLoader } from "./design-studio-loader";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trình thiết kế" };

/** Route params arrive percent-encoded; a stray `%` must not crash the page. */
function readId(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function DesignStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignStudioLoader designId={readId(id)} fonts={STUDIO_FONTS} />;
}
