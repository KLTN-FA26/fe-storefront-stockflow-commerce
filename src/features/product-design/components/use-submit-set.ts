"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { FontRegistry } from "../engine";
import {
  recordSetFailures,
  roundIsOpen,
  useOpenReviewRound,
  useSubmissionUpload,
} from "../round-mutations";
import type { Design } from "../types";
import type { ExportRenderer } from "./studio/export-renderer";
import { createSetRun } from "./submit-set-run";

type Options = {
  projectId: string;
  /** The drafts sent: read once, when the run is made. */
  designs: readonly Design[];
  fonts: FontRegistry;
  newRenderer?: (() => ExportRenderer) | undefined;
};

/**
 * The run of "Gửi duyệt cả bộ" for this page (`createSetRun`): it starts checking once on screen
 * and stops when the page goes (nothing more is sent). While a step works through the designs
 * (1 and 3), leaving the page asks the browser to confirm first.
 */
export function useSubmitSet({ projectId, designs, fonts, newRenderer }: Options) {
  const client = useQueryClient();
  const { mutateAsync: upload } = useSubmissionUpload();
  const { mutateAsync: open } = useOpenReviewRound(projectId);
  const [run] = useState(() => {
    const designIds = designs.map((design) => design.id);
    return createSetRun({
      client,
      fonts,
      newRenderer,
      designs,
      upload,
      open,
      recordSetFailure: (items) => recordSetFailures(client, projectId, items),
      roundIsOpen: () => roundIsOpen(client, projectId, designIds),
    });
  });
  const state = useSyncExternalStore(run.subscribe, run.getState, run.getState);

  useEffect(() => {
    run.start();
    return () => run.stop();
  }, [run]);

  const working = state.phase === "checking" || state.phase === "sending";
  useEffect(() => {
    if (!working) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true; // older Safari (and Chromium before 119) ask only when this is set
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [working]);

  return { state, run };
}
