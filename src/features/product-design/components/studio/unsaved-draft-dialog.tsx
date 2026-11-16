"use client";

import { useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { designDocumentQuery } from "../../queries";
import type { DesignDocumentRecord } from "../../types";
import { useStudio } from "./studio-context";
import { forgetUnsavedDraft, restorableDraft, type UnsavedDraft } from "./unsaved-draft";

/**
 * Why the edits were kept, which the offer says: the studio was left before they were stored, or
 * they were made while the design could not be saved and it is a draft again in this visit.
 */
type KeptBecause = "left" | "reopened";

const KEPT_BECAUSE: Record<KeptBecause, string> = {
  left: "Lần trước bạn rời trang khi thay đổi chưa kịp lưu (mất kết nối hoặc lưu lỗi). Trình duyệt này còn giữ bản đó: khôi phục để làm tiếp, hoặc bỏ qua để dùng bản đã lưu.",
  reopened:
    "Thiết kế đã trở lại để chỉnh sửa. Trình duyệt này còn giữ thay đổi chưa lưu được của bạn từ lúc thiết kế được gửi duyệt: khôi phục để làm tiếp, hoặc bỏ qua để dùng bản đã lưu.",
};

type Offer = { draft: UnsavedDraft; because: KeptBecause };

const offerOf = (draft: UnsavedDraft | null, because: KeptBecause): Offer | null =>
  draft && { draft, because };

/**
 * Offers back the edits this browser kept when the studio was last left before they were stored
 * (offline, or after a failed save), and those kept while the design could not be saved once it is
 * a draft again in the same visit (the review returned it). "Khôi phục bản chưa lưu" loads them
 * into the editor, and autosave stores them; "Bỏ qua" drops them and keeps the stored document.
 */
export function UnsavedDraftDialog({ record }: { record: DesignDocumentRecord }) {
  const { design, editor, readOnly } = useStudio();
  const client = useQueryClient();
  // Read when the studio opens on the stored document, and again when it turns editable.
  const [offer, setOffer] = useState(() => offerOf(restorableDraft(design.id, record), "left"));
  const open = offer !== null && !readOnly;

  const isEditable = useEffectEvent(() => !readOnly);
  /** Editable again: what was kept meanwhile is offered over the document stored now. */
  const offerAgain = useEffectEvent(async () => {
    let stored: DesignDocumentRecord;
    try {
      stored = await client.fetchQuery({ ...designDocumentQuery(design.id), staleTime: 0 });
    } catch {
      return; // the kept edits stay in this browser for the next visit
    }
    if (isEditable()) setOffer(offerOf(restorableDraft(design.id, stored), "reopened"));
  });
  const wasReadOnly = useRef(readOnly);
  useEffect(() => {
    if (wasReadOnly.current && !readOnly) void offerAgain();
    wasReadOnly.current = readOnly;
  }, [readOnly]);

  const restore = () => {
    if (offer) editor.replaceDocument(offer.draft.document);
    setOffer(null);
  };
  const skip = () => {
    forgetUnsavedDraft(design.id);
    setOffer(null);
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
          <DialogDescription>{KEPT_BECAUSE[offer?.because ?? "left"]}</DialogDescription>
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
