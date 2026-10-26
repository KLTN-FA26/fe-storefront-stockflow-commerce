"use client";

import dynamic from "next/dynamic";

import { StudioSkeleton } from "@/features/product-design/components/studio/studio-skeleton";
import type { DesignDraft } from "@/features/product-design/types";
import type { FontRegistry } from "@/features/product-design/engine";

import { ProductPhoto } from "./product-photo";

// The studio draws on canvases and runs three.js: browser only, and loaded by this route alone.
const DesignStudio = dynamic(
  () =>
    import("@/features/product-design/components/studio/design-studio").then(
      (mod) => mod.DesignStudio,
    ),
  { ssr: false, loading: () => <StudioSkeleton /> },
);

const productPhoto = (design: DesignDraft) =>
  design.productSlug ? <ProductPhoto slug={design.productSlug} sku={design.sku} /> : null;

/** `ssr: false` is only allowed in a client component, so the page renders the studio through this. */
export function DesignStudioLoader({ designId, fonts }: { designId: string; fonts: FontRegistry }) {
  return <DesignStudio designId={designId} fonts={fonts} renderProductPhoto={productPhoto} />;
}
