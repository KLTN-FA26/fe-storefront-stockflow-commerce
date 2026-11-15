"use client";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../errors";
import { useArchiveProject } from "../mutations";
import type { DesignProject } from "../types";

/**
 * "Đóng dự án" (docs 12 BR-22): the project turns read-only for good. A refusal (a design went
 * under review meanwhile, the project changed) stays in the dialog, and the page re-reads.
 */
export function CloseProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: DesignProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const archive = useArchiveProject(project.id);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (archive.isPending) return;
        if (!next) archive.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">
            Đóng dự án này?
          </DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            {`Dự án "${project.name}" sẽ chỉ để xem, không mở lại được. Các bản bên trong vẫn mở và dùng riêng lẻ được.`}
          </DialogDescription>
        </DialogHeader>
        {archive.isError ? <Alert tone="danger">{describeDesignError(archive.error)}</Alert> : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={archive.isPending}
            onClick={() => onOpenChange(false)}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate({ version: project.version }, { onSuccess: () => onOpenChange(false) })
            }
          >
            {archive.isPending ? "Đang đóng..." : "Đóng dự án"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
