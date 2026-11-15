"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { Gate, ProjectActions } from "../project-rules";
import { PROJECT_DESIGN_LIMIT } from "../project-schemas";
import type { DesignProject } from "../types";
import { CloseProjectDialog } from "./close-project-dialog";
import { ProjectStatusBadge } from "./project-status-badge";
import { ProjectTitle } from "./project-title";

type Props = {
  project: DesignProject;
  actions: ProjectActions;
  onCreate: () => void;
  onAdd: () => void;
};

/** A button that stays visible when it is locked, with the reason written under it. */
function GatedButton({
  gate,
  label,
  reasonId,
  onClick,
  variant = "default",
}: {
  gate: Gate;
  label: string;
  reasonId: string;
  onClick: () => void;
  variant?: "default" | "outline";
}) {
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        className="min-h-11 rounded-[var(--r-md)] px-4"
        disabled={!gate.allowed}
        aria-describedby={gate.allowed ? undefined : reasonId}
        onClick={onClick}
      >
        {label}
      </Button>
      {gate.allowed ? null : (
        <span id={reasonId} className="text-ink-secondary text-xs">
          {gate.reason}
        </span>
      )}
    </div>
  );
}

/**
 * The top of the project page (spec 2026-11-12 §5): the name (renamed in place), the description,
 * the status and how full the project is; while it is open, the buttons that grow or close it.
 * A closed project has none: it is for reading.
 */
export function ProjectHeader({ project, actions, onCreate, onAdd }: Props) {
  const [closing, setClosing] = useState(false);
  const open = project.status === "ACTIVE";
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
        </div>
      </div>
      {open ? (
        <div className="flex flex-wrap items-start gap-3">
          <GatedButton
            gate={actions.createDesign}
            label="Tạo bản mới trong dự án"
            reasonId="project-create-reason"
            onClick={onCreate}
          />
          <GatedButton
            gate={actions.addDesign}
            label="Thêm bản sẵn có"
            reasonId="project-add-reason"
            variant="outline"
            onClick={onAdd}
          />
          <GatedButton
            gate={actions.archive}
            label="Đóng dự án"
            reasonId="project-close-reason"
            variant="outline"
            onClick={() => setClosing(true)}
          />
        </div>
      ) : null}
      {open ? (
        <CloseProjectDialog project={project} open={closing} onOpenChange={setClosing} />
      ) : null}
    </header>
  );
}
