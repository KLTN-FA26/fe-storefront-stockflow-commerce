"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DesignUiState } from "../../lifecycle";
import type { DesignDraft } from "../../types";
import type { AutosaveControls } from "./studio-context";

/**
 * What the lifecycle steps (confirm, finalize, request changes, withdraw, the confirmed card) need:
 * the design, its state, the live region, and autosave's flush (a pending edit is saved before a
 * step). The studio provides it from its services; the workflow-only view (no editor, R72) has
 * nothing to save.
 */
export type WorkflowServices = {
  design: DesignDraft;
  uiState: DesignUiState;
  announce(message: string): void;
  autosave: Pick<AutosaveControls, "flush" | "latestState">;
};

/** Autosave for a view without an editor: nothing is ever pending. */
export const NOTHING_TO_SAVE: WorkflowServices["autosave"] = {
  flush: () => Promise.resolve(),
  latestState: () => "idle",
};

const WorkflowContext = createContext<WorkflowServices | null>(null);

export function WorkflowProvider({
  value,
  children,
}: {
  value: WorkflowServices;
  children: ReactNode;
}) {
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowServices {
  const services = useContext(WorkflowContext);
  if (!services) throw new Error("useWorkflow must be used inside <WorkflowProvider>");
  return services;
}
