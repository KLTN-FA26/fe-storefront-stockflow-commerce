"use client";

import dynamic from "next/dynamic";

import {
  LauncherFrame,
  LauncherLoading,
} from "@/features/product-design/components/launcher-states";
import type { FontRegistry } from "@/features/product-design/engine";

// Each design of the set is loaded onto canvases, three.js beside them, as in the studio: browser
// only, and loaded by this route alone.
const SubmitSetScreen = dynamic(
  () =>
    import("@/features/product-design/components/submit-set-screen").then(
      (mod) => mod.SubmitSetScreen,
    ),
  {
    ssr: false,
    loading: () => (
      <LauncherFrame>
        <LauncherLoading label="Đang tải dự án…" />
      </LauncherFrame>
    ),
  },
);

/** `ssr: false` is only allowed in a client component, so the page renders the screen through this. */
export function SubmitSetLoader({
  projectId,
  ids,
  fonts,
}: {
  projectId: string;
  ids: string[];
  fonts: FontRegistry;
}) {
  return <SubmitSetScreen projectId={projectId} ids={ids} fonts={fonts} />;
}
