"use client";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { PROJECT_DESIGN_LIMIT } from "../project-schemas";
import type { CloneResult, NotInProjectReason } from "../types";

/** A-E3: why a copy of a design in a project is in none. */
const NOT_IN_PROJECT: Record<NotInProjectReason, string> = {
  PROJECT_ARCHIVED: "Dự án của bản gốc đã đóng nên bản mới không nằm trong dự án.",
  PROJECT_FULL: `Dự án của bản gốc đã đủ ${PROJECT_DESIGN_LIMIT} bản nên bản mới không nằm trong dự án.`,
};

/**
 * What the copy left behind, once it is made: elements of print areas the new variant lacks, and
 * the project it did not join. The studio of the copy opens from here.
 */
export function CloneOutcome({
  result,
  dropped,
  onOpen,
}: {
  result: CloneResult;
  dropped: number;
  onOpen: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-ink-primary text-lg font-semibold">
          Đã tạo bản nhân bản
        </DialogTitle>
        <DialogDescription className="text-ink-secondary text-sm">
          “{result.design.name}” là một bản nháp mới. Hãy xem lại bố cục trong studio.
        </DialogDescription>
      </DialogHeader>
      {dropped > 0 ? (
        <Alert tone="warning">
          {dropped} phần tử không có chỗ trên quy cách mới nên đã được bỏ qua.
        </Alert>
      ) : null}
      {result.notInProject ? (
        <Alert tone="info">{NOT_IN_PROJECT[result.notInProject]}</Alert>
      ) : null}
      <DialogFooter>
        <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-5" onClick={onOpen}>
          Mở studio
        </Button>
      </DialogFooter>
    </>
  );
}
