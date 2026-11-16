"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { hasErrorCode } from "@/lib/api/describe-error";

import { getDesignDocument, getDesignPrintConfig, readDesignVersion } from "../api";
import type { FontRegistry } from "../engine";
import { isDesignGone } from "../errors";
import { designQuery } from "../queries";
import {
  recordSetFailures,
  roundIsOpen,
  useDesignFilesUpload,
  useOpenReviewRound,
} from "../round-mutations";
import type { Design } from "../types";
import type { ExportRenderer } from "./studio/export-renderer";
import { createSetRun } from "./submit-set-run";

/**
 * Why a draft at the version sent was refused with `CONFLICT` (`DesignSubmissionService.plan`):
 * its template read answers 404 `PRINT_CONFIG_NOT_FOUND` when it was not started on one, its
 * layout read 404 when it has none (`CustomerDesignService`). Null when both read.
 */
async function diagnoseRefusal(design: Design): Promise<"noTemplate" | "noLayout" | null> {
  const [template, layout] = await Promise.allSettled([
    getDesignPrintConfig(design),
    getDesignDocument(design.id),
  ]);
  if (template.status === "rejected" && hasErrorCode(template.reason, "PRINT_CONFIG_NOT_FOUND")) {
    return "noTemplate";
  }
  if (layout.status === "rejected" && isDesignGone(layout.reason)) return "noLayout";
  return null;
}

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
  const { mutateAsync: upload } = useDesignFilesUpload();
  const { mutateAsync: open } = useOpenReviewRound(projectId);
  const [run] = useState(() => {
    const designIds = designs.map((design) => design.id);
    return createSetRun({
      client,
      projectId,
      fonts,
      newRenderer,
      designs,
      upload,
      readVersion: (designId) => readDesignVersion(designId),
      open,
      recordSetFailure: (items) => recordSetFailures(client, projectId, items),
      roundIsOpen: () => roundIsOpen(client, projectId, designIds),
      // One read each, fresh: why the BE refused these designs, and what the pages show
      // afterwards. A design that is gone (404) reads as null.
      readDesigns: (ids) =>
        Promise.all(
          ids.map((id) =>
            client
              .fetchQuery({ ...designQuery(id), staleTime: 0, retry: false })
              .catch((error: unknown) => {
                if (isDesignGone(error)) return null;
                throw error;
              }),
          ),
        ),
      diagnose: (design) => diagnoseRefusal(design),
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
