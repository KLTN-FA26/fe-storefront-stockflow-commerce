"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PreflightReport } from "../../engine";
import { usePreflight } from "./use-preflight";

const PreflightContext = createContext<PreflightReport | null>(null);

/**
 * Runs the print checks of the open design once for the whole studio (R65). Only this provider
 * follows the document; `children` are elements made by its parent, so a drag re-renders the
 * provider alone and a new report re-renders only the components that read it.
 */
export function PreflightProvider({ children }: { children: ReactNode }) {
  const report = usePreflight();
  return <PreflightContext.Provider value={report}>{children}</PreflightContext.Provider>;
}

/** The report where there may be no studio around (the workflow-only view has none): `null` there. */
export function useOptionalPreflightReport(): PreflightReport | null {
  return useContext(PreflightContext);
}

/** The latest preflight report of the open design (`usePreflight`'s, debounced 300 ms). */
export function usePreflightReport(): PreflightReport {
  const report = useContext(PreflightContext);
  if (!report) throw new Error("usePreflightReport must be used inside <PreflightProvider>");
  return report;
}
