"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { DesignDocument } from "../../engine";
import type { DesignUiState } from "../../lifecycle";
import { useStudio } from "./studio-context";
import type { AutosaveStatus } from "./use-autosave";

/** States whose QC request or result the first save voids (spec §7.5), and what to say first. */
const VOIDED: Partial<Record<DesignUiState, { title: string; detail: string }>> = {
  awaitingReview: {
    title: "Chỉnh sửa sẽ huỷ yêu cầu kiểm tra QC. Tiếp tục?",
    detail: "QC đang kiểm tra bản hiện tại. Sau khi sửa, bạn cần gửi QC kiểm tra lại.",
  },
  reviewPassed: {
    title: "Chỉnh sửa sẽ huỷ kết quả kiểm tra QC. Tiếp tục?",
    detail:
      "Bản hiện tại đã đạt kỹ thuật. Sau khi sửa, bạn cần gửi QC kiểm tra lại trước khi chốt.",
  },
};

/** Whether autosave holds edits back: the customer has not accepted voiding QC's request/result. */
export type ReviewVoidGate = { holds(): boolean; accept(): void };

/**
 * The gate for `uiState`: in a state QC is involved in, edits are held back from autosave until
 * the customer accepts, once per state (a new state asks again).
 */
export function useReviewVoidGate(uiState: DesignUiState): ReviewVoidGate {
  const current = useRef({ state: uiState, accepted: false });
  useEffect(() => {
    current.current = { state: uiState, accepted: false };
  }, [uiState]);
  const [gate] = useState<ReviewVoidGate>(() => ({
    holds: () => VOIDED[current.current.state] !== undefined && !current.current.accepted,
    accept: () => {
      current.current = { ...current.current, accepted: true };
    },
  }));
  return gate;
}

/**
 * Asks before the first edit voids QC's request or result (spec §7.5). "Tiếp tục chỉnh sửa" lets
 * autosave store the edit; "Huỷ" puts the document back as it was. A conflict reload is not an
 * edit and does not ask.
 */
export function ReviewVoidDialog({
  gate,
  autosave,
}: {
  gate: ReviewVoidGate;
  autosave: Pick<AutosaveStatus, "latestState" | "releaseHeld" | "discardHeld">;
}) {
  const { editor, uiState } = useStudio();
  const [asking, setAsking] = useState(false);
  /** The document before the first held edit: what "Huỷ" goes back to. */
  const before = useRef<DesignDocument | null>(null);
  /**
   * The last document no held edit has touched. A ref, not the effect's own variable: the studio
   * re-renders while the dialog asks (polls, announcements), and a fresh subscription must not
   * take the held edit for the document to go back to.
   */
  const seen = useRef(editor.store.getState().document);
  const { latestState } = autosave;

  useEffect(
    () =>
      editor.onDocumentChange((document) => {
        if (before.current === null && gate.holds() && latestState() !== "conflict") {
          before.current = seen.current;
          setAsking(true);
        }
        if (before.current === null) seen.current = document;
      }),
    [editor, gate, latestState],
  );

  const accept = () => {
    gate.accept();
    before.current = null;
    setAsking(false);
    autosave.releaseHeld();
  };
  const decline = () => {
    const target = before.current;
    if (target) {
      // The held edit is one undo step (a drag is one gesture); a restored draft cleared history.
      while (editor.store.getState().document !== target && editor.store.getState().canUndo) {
        editor.undo();
      }
      if (editor.store.getState().document !== target) editor.replaceDocument(target);
    }
    autosave.discardHeld();
    before.current = null;
    setAsking(false);
  };

  const copy = VOIDED[uiState];
  return (
    <Dialog open={asking && copy !== undefined}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          decline();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.detail}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-border-default bg-bg-subtle">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={decline}
          >
            Huỷ
          </Button>
          <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-4" onClick={accept}>
            Tiếp tục chỉnh sửa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
