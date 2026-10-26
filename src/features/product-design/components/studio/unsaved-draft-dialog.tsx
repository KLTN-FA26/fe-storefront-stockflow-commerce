"use client";

import { History } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { DESIGN_UI_STATE_META } from "../../lifecycle";
import type { DesignDocumentRecord } from "../../types";
import { useStudio } from "./studio-context";
import { forgetUnsavedDraft, restorableDraft } from "./unsaved-draft";

/**
 * Offers back the edits this browser kept when the studio was last left before they were stored
 * (offline, or after a failed save). "Khôi phục bản chưa lưu" loads them into the editor, and
 * autosave stores them; "Bỏ qua" drops them and keeps the stored document.
 */
export function UnsavedDraftDialog({ record }: { record: DesignDocumentRecord }) {
  const { design, editor, uiState } = useStudio();
  // Read once, when the studio opens on the stored document.
  const [draft, setDraft] = useState(() => restorableDraft(design.id, record));
  const open = draft !== null && DESIGN_UI_STATE_META[uiState].editable;

  const restore = () => {
    if (draft) editor.replaceDocument(draft.document);
    setDraft(null);
  };
  const skip = () => {
    forgetUnsavedDraft(design.id);
    setDraft(null);
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-surface text-ink-primary rounded-[var(--r-xl)] sm:max-w-md"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Có thay đổi chưa được lưu</DialogTitle>
          <DialogDescription>
            Lần trước bạn rời trang khi thay đổi chưa kịp lưu (mất kết nối hoặc lưu lỗi). Trình
            duyệt này còn giữ bản đó: khôi phục để làm tiếp, hoặc bỏ qua để dùng bản đã lưu.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-border-default bg-bg-subtle">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={skip}
          >
            Bỏ qua
          </Button>
          <Button type="button" className="min-h-11 rounded-[var(--r-md)] px-4" onClick={restore}>
            <History aria-hidden className="mr-1.5 size-4" />
            Khôi phục bản chưa lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
