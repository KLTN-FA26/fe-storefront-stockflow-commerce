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

import {
  describeDesignError,
  isDesignConflict,
  isDesignGone,
  isDesignStateChanged,
} from "../errors";
import { useDeleteDesign } from "../mutations";
import type { Design } from "../types";

/**
 * The design the dialog holds is out of date: it moved on (409 DESIGN_NOT_DRAFT), changed or
 * submitted in another tab (409 CONFLICT) or is gone (404). Deleting it again cannot work;
 * the list re-reads (the mutation does), and the card shows what the customer can do now.
 */
const isStale = (error: unknown) =>
  isDesignStateChanged(error) || isDesignConflict(error) || isDesignGone(error);

/**
 * Confirms the deletion of a DRAFT (docs 12 BR-16); stays open and says why when it is refused.
 * Refused because the draft is out of date, "Xoá" stays off and "Đóng" closes the dialog.
 */
export function DeleteDesignDialog({
  design,
  onClose,
}: {
  /** The draft to delete; `null` keeps the dialog closed. */
  design: Design | null;
  onClose: () => void;
}) {
  const remove = useDeleteDesign();
  const stale = isStale(remove.error);
  const close = () => {
    remove.reset();
    onClose();
  };
  return (
    <Dialog open={design !== null} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="bg-bg-surface border-border-default rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">
            Xoá bản nháp này?
          </DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            {design ? `“${design.name}” sẽ bị xoá và không khôi phục được.` : null}
          </DialogDescription>
        </DialogHeader>
        {remove.error ? <Alert tone="danger">{describeDesignError(remove.error)}</Alert> : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            onClick={close}
          >
            {stale ? "Đóng" : "Giữ lại"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={remove.isPending || !design || stale}
            onClick={() => {
              if (!design) return;
              remove.mutate({ id: design.id, version: design.version }, { onSuccess: close });
            }}
          >
            {remove.isPending ? "Đang xoá..." : "Xoá bản nháp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
