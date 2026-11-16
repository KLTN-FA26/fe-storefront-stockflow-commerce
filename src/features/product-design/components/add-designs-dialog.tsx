"use client";

import { useState } from "react";

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
import { useDesignList } from "../queries";
import type { Design } from "../types";
import { DesignListSkeleton, DesignLoadError } from "./design-list-states";
import { DesignStatusBadge } from "./design-status-badge";
import { isReturned } from "../lifecycle";

/** Designs read a page at a time; the ones that already belong to a project are left out of it. */
const PAGE_SIZE = 20;

/** docs 12 BR-17: a design joins one project at most, and a deleted one joins none. */
const isJoinable = (design: Design) => design.project === null && design.status !== "ARCHIVED";

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
  const [page, setPage] = useState(1);
  const list = useDesignList({ page, size: PAGE_SIZE });
  const add = useAddDesignToProject(projectId);
  const { data, isPending, error, isFetching, isPlaceholderData, refetch } = list;
  const rows = (data?.items ?? []).filter(isJoinable);
  // A page with nothing to offer reads on: the empty state is for when every page has been read.
  // While the next page loads, the hook still answers the previous one (placeholder): that is
  // "reading" too, not an empty list.
  const reading = data !== undefined && rows.length === 0 && data.hasNext;
  if (reading && !isPlaceholderData) setPage(page + 1); // adjusted while rendering: no wasted paint
  if (isPending || reading) return <DesignListSkeleton />;
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
      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={!data.hasPrevious || isFetching}
            onClick={() => setPage(page - 1)}
          >
            Trang trước
          </Button>
          <span className="text-ink-secondary text-sm tabular-nums">
            {data.page}/{data.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-[var(--r-md)] px-4"
            disabled={!data.hasNext || isFetching}
            onClick={() => setPage(page + 1)}
          >
            Trang sau
          </Button>
        </div>
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
