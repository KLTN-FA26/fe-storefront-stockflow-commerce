"use client";

import { Box } from "lucide-react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { describeDesignError } from "../errors";
import { useRemoveDesignFromProject } from "../mutations";
import { canRemoveFromProject } from "../project-rules";
import type { Design } from "../types";
import { DesignCard } from "./design-card";

const ACTION_CLASS = "min-h-11 rounded-[var(--r-md)] px-4";

type Props = {
  design: Design;
  projectId: string;
  /** The project is open: designs can be chosen for a set and taken out. */
  open: boolean;
  checked: boolean;
  onCheckedChange: (design: Design, checked: boolean) => void;
  onView3D: (design: Design) => void;
  onClone: (design: Design) => void;
};

/** A design of the project: the list's card, with what only a project adds to it. */
export function ProjectDesignCard({
  design,
  projectId,
  open,
  checked,
  onCheckedChange,
  onView3D,
  onClone,
}: Props) {
  const remove = useRemoveDesignFromProject(projectId);
  const gate = canRemoveFromProject(design);
  const reasonId = `remove-${design.id}-reason`;
  // Only a draft can go in a set (docs 12 BR-19).
  const selectable = open && design.status === "DRAFT";
  return (
    <DesignCard
      design={design}
      hideProject
      onClone={onClone}
      selection={
        selectable ? (
          <label className="bg-bg-surface border-border-default flex size-11 cursor-pointer items-center justify-center rounded-[var(--r-md)] border shadow-[var(--sh-sm)]">
            <Checkbox
              checked={checked}
              aria-label={`Chọn ${design.name} để gửi duyệt cả bộ`}
              onCheckedChange={(next) => onCheckedChange(design, next === true)}
            />
          </label>
        ) : null
      }
      notes={
        <>
          {open && !gate.allowed ? (
            <p id={reasonId} className="text-ink-secondary text-sm">
              {gate.reason}
            </p>
          ) : null}
          {remove.isError && gate.allowed ? (
            <Alert tone="danger">{describeDesignError(remove.error)}</Alert>
          ) : null}
        </>
      }
      extraActions={
        <>
          <Button
            type="button"
            variant="outline"
            className={ACTION_CLASS}
            aria-label={`Xem 3D ${design.name}`}
            onClick={() => onView3D(design)}
          >
            <Box aria-hidden className="mr-2 size-4" />
            Xem 3D
          </Button>
          {open ? (
            <Button
              type="button"
              variant="ghost"
              className={ACTION_CLASS}
              disabled={!gate.allowed || remove.isPending}
              aria-label={`Gỡ ${design.name} khỏi dự án`}
              aria-describedby={gate.allowed ? undefined : reasonId}
              onClick={() => {
                remove.reset();
                remove.mutate(design.id);
              }}
            >
              {remove.isPending ? "Đang gỡ..." : "Gỡ khỏi dự án"}
            </Button>
          ) : null}
        </>
      }
    />
  );
}
