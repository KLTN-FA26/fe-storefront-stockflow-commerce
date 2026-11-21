"use client";

import { Alert, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { describeDesignError } from "../errors";
import { useAddDesignToProject } from "../mutations";
import { useAddableDesigns } from "../queries";
import type { Design } from "../types";
import { DesignListSkeleton, DesignLoadError } from "./design-list-states";
import { DesignStatusBadge } from "./design-status-badge";
import { isReturned } from "../lifecycle";

/**
 * Designs read a page at a time, on request. The BE leaves out the ones already in a project and
 * the deleted ones (docs 12 BR-17: a design joins one project at most; BE-15).
 */
const PAGE_SIZE = 20;

function DesignRow({
  design,
  busy,
  adding,
  onAdd,
}: {
  design: Design;
  busy: boolean;
  adding: boolean;
  onAdd: (design: Design) => void;
}) {
  return (
    <li className="border-border-default flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border p-3">
      <div className="min-w-0 space-y-1">
        <p className="text-ink-primary truncate text-sm font-semibold">{design.name}</p>
        <p className="text-ink-tertiary truncate text-xs">
          {design.product.title} · {design.variant.label}
        </p>
        <DesignStatusBadge status={design.status} returned={isReturned(design)} />
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-[var(--r-md)] px-4"
        disabled={busy}
        aria-label={`Thêm ${design.name}`}
        onClick={() => onAdd(design)}
      >
        {adding ? "Đang thêm..." : "Thêm"}
      </Button>
    </li>
  );
}

function AddDesignsList({ projectId }: { projectId: string }) {
  const list = useAddableDesigns(PAGE_SIZE);
  const add = useAddDesignToProject(projectId);
  const { data, isPending, error, isFetching, isFetchingNextPage, hasNextPage, refetch } = list;
  const { fetchNextPage, isFetchNextPageError } = list;
  const rows = data?.pages.flatMap((page) => page.items) ?? [];

  if (isPending) return <DesignListSkeleton />;
  if (error && !data) {
    return <DesignLoadError error={error} onRetry={() => void refetch()} retrying={isFetching} />;
  }
  return (
    <div className="space-y-3">
      {add.isError ? <Alert tone="danger">{describeDesignError(add.error)}</Alert> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="Không có bản nào để thêm"
          description="Chỉ những bản chưa thuộc dự án nào và chưa bị xoá mới thêm được."
        />
      ) : (
        <ul aria-label="Bản có thể thêm" className="space-y-2">
          {rows.map((design) => (
            <DesignRow
              key={design.id}
              design={design}
              busy={add.isPending}
              adding={add.isPending && add.variables === design.id}
              onAdd={(picked) => add.mutate(picked.id)}
            />
          ))}
        </ul>
      )}
      {isFetchNextPageError ? <Alert tone="danger">{describeDesignError(list.error)}</Alert> : null}
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full rounded-[var(--r-md)] px-4"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Đang tải…" : isFetchNextPageError ? "Thử lại" : "Xem thêm"}
        </Button>
      ) : null}
    </div>
  );
}

/** "Thêm bản sẵn có" (spec 2026-11-12 §5): the customer's designs that are in no project yet. */
export function AddDesignsDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-surface border-border-default max-h-[90dvh] gap-4 overflow-y-auto rounded-[var(--r-xl)] border p-[var(--card-pad)] shadow-[var(--sh-lg)] ring-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-ink-primary text-lg font-semibold">
            Thêm bản sẵn có
          </DialogTitle>
          <DialogDescription className="text-ink-secondary text-sm">
            Chọn bản thiết kế bạn đã làm và chưa thuộc dự án nào.
          </DialogDescription>
        </DialogHeader>
        {/* Unmounts with the dialog: it reads the list afresh each time it opens. */}
        <AddDesignsList projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
