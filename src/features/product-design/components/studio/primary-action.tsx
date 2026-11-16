"use client";

import { CopyPlus, Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../../errors";
import { allowedActions } from "../../lifecycle";
import { useCreateRevision } from "../../mutations";
import { STUDIO_ANNOUNCEMENTS } from "./studio-announcer";
import { useStudio } from "./studio-context";
import { SubmitDialog } from "./submit-dialog";

const BUTTON = "min-h-11 min-w-11 shrink-0 rounded-[var(--r-md)] px-3 sm:px-4";

/** The action's words: read out everywhere, shown from `sm` (a narrow header keeps the icon). */
const ActionLabel = ({ children }: { children: string }) => (
  <span className="sr-only sm:not-sr-only sm:ml-1.5">{children}</span>
);

/**
 * "Tạo bản sửa" (docs 12 §4.7, BR-12): a new DRAFT from the approved design, opened at once. A
 * refusal (the 50-draft limit, B37) is said in a small dialog.
 */
function CreateRevision() {
  const { design, announce } = useStudio();
  const { push } = useRouter();
  const revision = useCreateRevision();
  return (
    <>
      <Button
        type="button"
        className={BUTTON}
        disabled={revision.isPending}
        onClick={() =>
          revision.mutate(design.id, {
            onSuccess: (draft) => {
              announce(STUDIO_ANNOUNCEMENTS.revisionCreated);
              push(STORE_ROUTES.design.detail(draft.id));
            },
          })
        }
      >
        {revision.isPending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <CopyPlus aria-hidden className="size-4" />
        )}
        <ActionLabel>Tạo bản sửa</ActionLabel>
      </Button>
      <Dialog open={revision.isError} onOpenChange={(open) => !open && revision.reset()}>
        <DialogContent className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chưa tạo được bản sửa</DialogTitle>
            <DialogDescription>
              {revision.error ? describeDesignError(revision.error) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-border-default bg-bg-subtle">
            <Button
              type="button"
              className="min-h-11 rounded-[var(--r-md)] px-4"
              onClick={() => revision.reset()}
            >
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The header's primary lifecycle action, from `allowedActions` (spec §6.4): "Gửi duyệt" for a
 * DRAFT (it opens the `SubmitDialog`), "Tạo bản sửa" for an APPROVED design, nothing while it is
 * reviewed. The submit dialog stays mounted across the status change its own submission makes, so
 * it is not torn down before it closes itself.
 */
export function PrimaryAction() {
  const { design } = useStudio();
  const actions = allowedActions(design);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      {actions.includes("submit") ? (
        <Button type="button" className={BUTTON} onClick={() => setSubmitting(true)}>
          <Send aria-hidden className="size-4" />
          <ActionLabel>Gửi duyệt</ActionLabel>
        </Button>
      ) : actions.includes("createRevision") ? (
        <CreateRevision />
      ) : null}
      <SubmitDialog open={submitting} onOpenChange={setSubmitting} />
    </>
  );
}
