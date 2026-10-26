"use client";

import { useEffect, useMemo, useState } from "react";

import { runPreflight, type PreflightReport } from "../../engine";
import { useEditorState, useStudio } from "./studio-context";

/** How long the document and the load states must stay as they are before the checks run again. */
export const PREFLIGHT_DEBOUNCE_MS = 300;

/**
 * The client-side print checks of the open design: `runPreflight` over the editor's document, the
 * template, the surfaces and the load state of its images and fonts. The report of the design as it
 * opens is there on the first render; after that it is recomputed `PREFLIGHT_DEBOUNCE_MS` after the
 * last change to any of them, so a drag or a stroke does not run the checks every frame.
 */
export function usePreflight(): PreflightReport {
  const { template, surfaces, sizer, assetStatus, fontStatus } = useStudio();
  const document = useEditorState((state) => state.document);
  const input = useMemo(
    () => ({ document, template, surfaces, sizer, assets: assetStatus, fontStatus }),
    [document, template, surfaces, sizer, assetStatus, fontStatus],
  );

  // The input the report is of: the first one at once, each later one after the wait.
  const [settled, setSettled] = useState(input);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(input), PREFLIGHT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  return useMemo(() => runPreflight(settled), [settled]);
}
