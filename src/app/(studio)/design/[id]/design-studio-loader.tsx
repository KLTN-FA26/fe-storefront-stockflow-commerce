"use client";

import dynamic from "next/dynamic";

import { StudioSkeleton } from "@/features/product-design/components/studio/studio-skeleton";
import type { FontRegistry } from "@/features/product-design/engine";
import type { Design } from "@/features/product-design/types";

import { ProductPhoto } from "./product-photo";

// The studio draws on canvases and runs three.js: browser only, and loaded by this route alone.
const DesignStudio = dynamic(
  () =>
    import("@/features/product-design/components/studio/design-studio").then(
      (mod) => mod.DesignStudio,
    ),
  { ssr: false, loading: () => <StudioSkeleton /> },
);

/** The catalogue photo of the design's variant, beside the flat preview. */
const productPhoto = (design: Design) =>
  design.product.slug ? <ProductPhoto slug={design.product.slug} sku={design.variant.sku} /> : null;

/** `ssr: false` is only allowed in a client component, so the page renders the studio through this. */
export function DesignStudioLoader({ designId, fonts }: { designId: string; fonts: FontRegistry }) {
  return <DesignStudio designId={designId} fonts={fonts} renderProductPhoto={productPhoto} />;
}
