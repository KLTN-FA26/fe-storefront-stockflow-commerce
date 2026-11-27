"use client";

import { useState } from "react";

import { Alert } from "@/components/shared";

import type { FontRegistry } from "../engine";
import type { useProjectDesigns } from "../queries";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";

import { projectActions, projectStage, type Gate, type ProjectActions } from "../project-rules";
import { currentQuoteRequest, useProjectQuoteRequests } from "../quote-request-queries";
import type { Design, DesignProject } from "../types";
import { MockReviewPanel } from "./mock-review-panel";
import { AddDesignsDialog } from "./add-designs-dialog";
import { CloneDesignDialog } from "./clone-design-dialog";
import { Design3DDialog } from "./design-3d-dialog";
import { DesignListSkeleton, DesignLoadError } from "./design-list-states";
import { NewDesignDialog, type DesignableCatalogue } from "./new-design-dialog";
import { OpenRoundBanner } from "./open-round-banner";
import { ProjectDesigns } from "./project-designs";
import { ProjectHeader } from "./project-header";
import { ProjectLibrary } from "./project-library";
import { ProjectQuoteSection } from "./project-quote-section";
import { ProjectSteps } from "./project-steps";
import { useCreateGate } from "./project-header";
import { SubmitSetBar } from "./submit-set-bar";

/** Until the designs are read nothing can be asked of the project: every gate is shut. */
const WAITING: Gate = { allowed: false };
const WAITING_ACTIONS: ProjectActions = {
  createDesign: WAITING,
  addDesign: WAITING,
  archive: WAITING,
  submitSet: WAITING,
};

type BodyProps = {
  project: DesignProject;
  designs: ReturnType<typeof useProjectDesigns>;
  catalogue: DesignableCatalogue;
  loadFonts: () => Promise<FontRegistry>;
};

export function ProjectBody({ project, designs, catalogue, loadFonts }: BodyProps) {
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Design | null>(null);
  const [cloning, setCloning] = useState<Design | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [askingQuote, setAskingQuote] = useState(false);
  const open = project.status === "ACTIVE";
  const quoteRequests = useProjectQuoteRequests(project.id);
  const mayAskQuote = useHasPermission(PERM.designQuoteRequest) && open;
  const items = designs.data;
  const actions = items ? projectActions(project, items) : WAITING_ACTIONS;
  // A design that stopped being a draft (submitted elsewhere) drops out of the choice.
  const chosenIds = (items ?? [])
    .filter((design) => design.status === "DRAFT" && chosen.has(design.id))
    .map((design) => design.id);
  const choose = (design: Design, checked: boolean) =>
    setChosen((now) => {
      const next = new Set(now);
      if (checked) next.add(design.id);
      else next.delete(design.id);
      return next;
    });

  const createGate = useCreateGate(actions);
  const stage = projectStage((items ?? []).filter((design) => design.status !== "ARCHIVED"));
  // The selection bar comes with a selection: with nothing chosen it would only sit over the designs
  // with a locked button (UI/UX 27/11, sf-12); the steps above say how to start one.
  const barShown = open && chosenIds.length > 0;

  return (
    <div className="space-y-6">
      <ProjectHeader
        project={project}
        actions={actions}
        createGate={createGate}
        primaryCreate={stage === "design"}
        onCreate={() => setCreating(true)}
        onAdd={() => setAdding(true)}
      />
      {open ? null : (
        <Alert tone="info" title="Dự án đã đóng, chỉ để xem">
          Các bản bên trong vẫn mở và dùng riêng lẻ được.
        </Alert>
      )}
      {open && items ? (
        <ProjectSteps
          stage={stage}
          designs={items}
          createGate={createGate}
          quoteRequest={currentQuoteRequest(quoteRequests.data)}
          mayAskQuote={mayAskQuote}
          onAskQuote={() => setAskingQuote(true)}
        />
      ) : null}
      <OpenRoundBanner round={project.openRound} designs={items} />
      <ProjectQuoteSection
        project={project}
        designs={items}
        asking={askingQuote}
        onAskingChange={setAskingQuote}
      />
      {items ? (
        <ProjectDesigns
          designs={items}
          projectId={project.id}
          open={open}
          chosen={new Set(chosenIds)}
          onChoose={choose}
          onView3D={setViewing}
          onClone={setCloning}
        />
      ) : designs.isError ? (
        <DesignLoadError
          error={designs.error}
          onRetry={() => void designs.refetch()}
          retrying={designs.isFetching}
        />
      ) : (
        <DesignListSkeleton />
      )}
      <ProjectLibrary project={project} />
      {barShown ? (
        <SubmitSetBar projectId={project.id} chosen={chosenIds} gate={actions.submitSet} />
      ) : null}
      <MockReviewPanel liftForBar={barShown} />
      {open ? (
        <>
          <NewDesignDialog
            catalogue={catalogue}
            open={creating}
            onOpenChange={setCreating}
            projectId={project.id}
          />
          <AddDesignsDialog projectId={project.id} open={adding} onOpenChange={setAdding} />
        </>
      ) : null}
      <Design3DDialog design={viewing} onClose={() => setViewing(null)} loadFonts={loadFonts} />
      <CloneDesignDialog
        design={cloning}
        open={cloning !== null}
        onOpenChange={(next) => (next ? undefined : setCloning(null))}
        skusOf={catalogue.skusOf}
      />
    </div>
  );
}
