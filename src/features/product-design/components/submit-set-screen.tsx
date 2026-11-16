"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { useSignedIn } from "@/lib/auth/use-signed-in";

import type { FontRegistry } from "../engine";
import { describeDesignError, isDesignGone } from "../errors";
import { DESIGN_STATUS_META } from "../lifecycle";
import { MIN_SET_SIZE } from "../project-rules";
import { useProject, useProjectDesigns } from "../queries";
import type { Design, DesignProject } from "../types";
import { LauncherLoading, LauncherSignIn } from "./launcher-states";
import { ProjectNotFound } from "./project-screen-states";
import type { ExportRenderer } from "./studio/export-renderer";
import { SetPanel } from "./submit-set-panel";
import { SetRows } from "./submit-set-rows";
import {
  SetAnnouncer,
  SetClosed,
  SetFrame,
  SetHeader,
  SetLoadError,
  SetSteps,
  SetTooSmall,
  type LeftOut,
} from "./submit-set-states";
import { useSubmitSet } from "./use-submit-set";

type Props = {
  projectId: string;
  /** The drafts chosen on the project page (`?ids=`). */
  ids: readonly string[];
  /** The studio's fonts: the check and the files are made with the real faces. */
  fonts: FontRegistry;
  /** Test seam: a renderer of the review files for each design loaded (jsdom has no canvas). */
  newRenderer?: (() => ExportRenderer) | undefined;
};

/**
 * `/design/projects/[id]/submit?ids=…` — "Gửi duyệt cả bộ" (spec 2026-11-12 §8, docs 12 §4.10,
 * BR-19), a computer-only page of the studio route group (planning decision Q1). Of the chosen
 * designs, the project's drafts are sent; an ACTIVE project and 2 drafts at least are needed.
 */
export function SubmitSetScreen(props: Props) {
  const signedIn = useSignedIn();
  if (signedIn !== true) {
    return (
      <SetFrame>
        {signedIn === undefined ? (
          <LauncherLoading label="Đang tải dự án…" />
        ) : (
          <LauncherSignIn from={STORE_ROUTES.design.projectSubmit(props.projectId, props.ids)} />
        )}
      </SetFrame>
    );
  }
  return <ChosenSet {...props} />;
}

function ChosenSet({ projectId, ids, fonts, newRenderer }: Props) {
  const project = useProject(projectId);
  const designs = useProjectDesigns(projectId);
  // The set is fixed once it can be sent: the run's own changes (drafts going to review) and later
  // reads of the project must not take the page away from under it.
  const [chosen, setChosen] = useState<{ designs: readonly Design[]; left: LeftOut[] } | null>(
    null,
  );
  const drafts = ids.flatMap(
    (id) => designs.data?.filter((d) => d.id === id && d.status === "DRAFT") ?? [],
  );
  const sendable = project.data?.status === "ACTIVE" && drafts.length >= MIN_SET_SIZE;
  if (chosen === null && sendable) setChosen({ designs: drafts, left: leftOut(ids, designs.data) });

  if (chosen && project.data) {
    return (
      <SubmitSetRun
        project={project.data}
        designs={chosen.designs}
        left={chosen.left}
        fonts={fonts}
        newRenderer={newRenderer}
      />
    );
  }
  const failed = project.error ?? designs.error;
  const body = (() => {
    if (isDesignGone(project.error)) return <ProjectNotFound />;
    if (failed && (!project.data || !designs.data)) {
      return (
        <SetLoadError
          message={describeDesignError(failed)}
          onRetry={() => void Promise.all([project.refetch(), designs.refetch()])}
          retrying={project.isFetching || designs.isFetching}
          projectId={projectId}
        />
      );
    }
    if (!project.data || !designs.data) return <LauncherLoading label="Đang tải dự án…" />;
    if (project.data.status !== "ACTIVE") return <SetClosed projectId={projectId} />;
    return <SetTooSmall projectId={projectId} />;
  })();
  return <SetFrame>{body}</SetFrame>;
}

/**
 * The chosen designs that are not sent, and why (docs 12 §4.10 leaves the choice to the customer:
 * the page says what it left out rather than drop it silently).
 */
function leftOut(ids: readonly string[], designs: readonly Design[] = []): LeftOut[] {
  return ids.flatMap((id): LeftOut[] => {
    const design = designs.find((d) => d.id === id);
    if (design?.status === "DRAFT") return [];
    if (!design) return [{ id, name: null, reason: "Một bản đã chọn không còn trong dự án." }];
    const status = DESIGN_STATUS_META[design.status].label.toLowerCase();
    return [{ id, name: design.name, reason: `${status}, không còn là bản nháp.` }];
  });
}

function SubmitSetRun({
  project,
  designs,
  left,
  fonts,
  newRenderer,
}: Omit<Props, "projectId" | "ids"> & {
  project: DesignProject;
  designs: readonly Design[];
  left: readonly LeftOut[];
}) {
  // `replace`: Back from the project must not open this page again, nor run the set again.
  const { replace } = useRouter();
  const { state, run } = useSubmitSet({ projectId: project.id, designs, fonts, newRenderer });
  const back = STORE_ROUTES.design.project(project.id);

  useEffect(() => {
    if (state.phase === "done") replace(back);
  }, [state.phase, replace, back]);

  return (
    <SetFrame>
      <SetHeader projectId={project.id} name={project.name} count={designs.length} left={left} />
      <SetSteps step={state.step} />
      <SetAnnouncer announcement={state.announcement} />
      <SetRows designs={designs} rows={state.rows} />
      <SetPanel
        state={state}
        count={designs.length}
        back={back}
        onConfirm={run.confirm}
        onRetry={run.retry}
        onRecheck={run.recheck}
        onCancel={() => {
          run.stop(); // nothing more is sent: no round is opened
          replace(back);
        }}
      />
    </SetFrame>
  );
}
