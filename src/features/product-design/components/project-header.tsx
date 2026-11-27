"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { Gate, ProjectActions } from "../project-rules";

const ACTION = "min-h-11 rounded-[var(--r-md)] px-4";
import { PROJECT_DESIGN_LIMIT } from "../project-schemas";
import type { DesignProject } from "../types";
import { ChatAboutButton } from "./chat-about-button";
import { CloseProjectDialog } from "./close-project-dialog";
import { useDeviceFit } from "./desktop-only-gate";
import { DESIGN_NEEDS_COMPUTER } from "./new-design-action";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectTitle } from "./project-title";

type Props = {
  project: DesignProject;
  actions: ProjectActions;
  /** `useCreateGate(actions)`: creating, the device included. */
  createGate: Gate;
  /** "Tạo bản mới" is the page's primary action while the project is at its design step. */
  primaryCreate: boolean;
  onCreate: () => void;
  onAdd: () => void;
};

/**
 * Creating a design in the project: the project's own gate, and a computer, since a new design
 * opens the studio (SF-UX-8): a phone or tablet is told here, before the product dialog.
 */
export function useCreateGate(actions: ProjectActions): Gate {
  const unsupported = useDeviceFit() === "unsupported";
  return unsupported && actions.createDesign.allowed
    ? { allowed: false, reason: DESIGN_NEEDS_COMPUTER }
    : actions.createDesign;
}

/** The reasons of the actions not offered now, once each (two locked buttons give one line). */
const reasonsOf = (...gates: Gate[]) => [
  ...new Set(gates.flatMap((gate) => (!gate.allowed && gate.reason ? [gate.reason] : []))),
];

/**
 * The top of the project page (spec 2026-11-12 §5): the name (renamed in place), the description,
 * the status and how full the project is; while it is open, the buttons that grow or close it -
 * only those it allows now, an action it does not allow being left out with its reason said once
 * (UI/UX 27/11, sf-12) rather than shown locked. A closed project has none: it is for reading.
 */
export function ProjectHeader({
  project,
  actions,
  createGate,
  primaryCreate,
  onCreate,
  onAdd,
}: Props) {
  const [closing, setClosing] = useState(false);
  const open = project.status === "ACTIVE";
  const reasons = reasonsOf(createGate, actions.addDesign);
  return (
    <header className="space-y-4">
      <div className="space-y-2">
        <ProjectTitle project={project} />
        {project.description ? (
          <p className="text-ink-secondary text-sm break-words sm:text-base">
            {project.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <ProjectStatusBadge status={project.status} />
          <span className="text-ink-secondary text-sm tabular-nums">
            {project.designCount}/{PROJECT_DESIGN_LIMIT} bản
          </span>
          <ChatAboutButton kind="DESIGN_PROJECT" id={project.id} name={project.name} />
        </div>
      </div>
      {open ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            {createGate.allowed ? (
              <Button
                type="button"
                variant={primaryCreate ? "default" : "outline"}
                className={ACTION}
                onClick={onCreate}
              >
                Tạo bản mới trong dự án
              </Button>
            ) : null}
            {actions.addDesign.allowed ? (
              <Button type="button" variant="outline" className={ACTION} onClick={onAdd}>
                Thêm bản sẵn có
              </Button>
            ) : null}
            {/* Closing is the rare move: quiet, and only offered with no design under review. */}
            {actions.archive.allowed ? (
              <Button
                type="button"
                variant="ghost"
                className={ACTION}
                onClick={() => setClosing(true)}
              >
                Đóng dự án
              </Button>
            ) : null}
          </div>
          {reasons.length > 0 ? (
            <p className="text-ink-secondary text-sm">{reasons.join(". ")}.</p>
          ) : null}
        </div>
      ) : null}
      {open ? (
        <CloseProjectDialog project={project} open={closing} onOpenChange={setClosing} />
      ) : null}
    </header>
  );
}
