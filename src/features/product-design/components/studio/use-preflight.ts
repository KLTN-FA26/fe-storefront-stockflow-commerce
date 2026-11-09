"use client";

import { useEffect, useMemo, useState } from "react";

import { runPreflight, type PreflightReport, type PreflightVariant } from "../../engine";
import type { PrintConfig } from "../../types";
import { useEditorState, useStudio } from "./studio-context";

/** How long the document and the load states must stay as they are before the checks run again. */
export const PREFLIGHT_DEBOUNCE_MS = 300;

/**
 * What the preflight checks of the variant (ruling R6): it takes designs while `ACTIVE`, and a
 * submit needs its carton spec (docs 12 BR-05, B25). The server checks both again on submit.
 */
export const preflightVariant = (
  config: Pick<PrintConfig, "variantStatus" | "hasCartonSpec">,
): PreflightVariant => ({
  usable: config.variantStatus === "ACTIVE",
  hasCartonSpec: config.hasCartonSpec,
});

/**
 * The client-side print checks of the open design: `runPreflight` over the editor's document, the
 * template, the surfaces, the load state of its images and fonts, and the variant as its print
 * configuration says. The report of the design as it opens is there on the first render; after
 * that it is recomputed `PREFLIGHT_DEBOUNCE_MS` after the last change to any of them, so a drag
 * or a stroke does not run the checks every frame.
 */
export function usePreflight(): PreflightReport {
  const { template, surfaces, sizer, assetStatus, fontStatus, printConfig } = useStudio();
  const document = useEditorState((state) => state.document);
  const { variantStatus, hasCartonSpec } = printConfig;
  const input = useMemo(
    () => ({
      document,
      template,
      surfaces,
      sizer,
      assets: assetStatus,
      fontStatus,
      variant: preflightVariant({ variantStatus, hasCartonSpec }),
    }),
    [document, template, surfaces, sizer, assetStatus, fontStatus, variantStatus, hasCartonSpec],
  );

  // The input the report is of: the first one at once, each later one after the wait.
  const [settled, setSettled] = useState(input);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(input), PREFLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  return useMemo(() => runPreflight(settled), [settled]);
}
