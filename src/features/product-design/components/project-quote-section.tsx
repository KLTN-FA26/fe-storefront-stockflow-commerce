"use client";

import { RotateCw } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { PERM } from "@/lib/auth/permission-codes";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { cn } from "@/lib/cn";

import {
  currentQuoteRequest,
  openQuoteRequest,
  useProjectQuoteRequests,
} from "../quote-request-queries";
import type { Design, DesignProject, ProjectQuoteRequest } from "../types";
import { ProjectQuoteDialog } from "./project-quote-dialog";
import {
  ACTION_BUTTON,
  AnsweringQuoteLink,
  QuoteRequestStatusBadge,
  cartonsLabel,
  desiredDateLabel,
} from "./quote-request-parts";

/** A project request: its status, the shared date, and each design with its cartons and SKU. */
function ProjectQuoteFacts({ request }: { request: ProjectQuoteRequest }) {
  return (
    <div className="bg-bg-subtle grid gap-2 rounded-[var(--r-md)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <QuoteRequestStatusBadge request={request} />
        <span className="text-ink-secondary tabular-nums">
          Ngày giao: {desiredDateLabel(request.desiredDeliveryDate)}
        </span>
      </div>
      <ul aria-label="Các bản trong yêu cầu" className="grid gap-1">
        {request.lines.map((line) => (
          <li key={line.designId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-ink-primary min-w-0 flex-1 truncate">{line.designName}</span>
            <span className="text-ink-primary tabular-nums">{cartonsLabel(line.cartons)}</span>
            {line.customerSku ? (
              <span className="text-ink-tertiary basis-full font-mono text-xs break-all">
                {line.customerSku}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <AnsweringQuoteLink request={request} />
    </div>
  );
}

/**
 * The project's quote request on its page (docs 12 §4.11): the one open now (else the latest), and
 * "Yêu cầu báo giá cả dự án" while the project is open, for a customer who may ask, once a design is
 * approved. Before that, with nothing asked, it is not shown: the page's steps say what comes first
 * (UI/UX 27/11, sf-12). A closed project offers no ask (the BE answers 409
 * `DESIGN_PROJECT_ARCHIVED`) but still shows its request.
 */
export function ProjectQuoteSection({
  project,
  designs,
  asking: askingProp,
  onAskingChange,
}: {
  project: DesignProject;
  /** Undefined while the designs are read. */
  designs: readonly Design[] | undefined;
  /** The ask dialog is open; the page's step bar opens it too. Its own state when not given. */
  asking?: boolean;
  onAskingChange?: (open: boolean) => void;
}) {
  const requests = useProjectQuoteRequests(project.id);
  const allowed = useHasPermission(PERM.designQuoteRequest);
  const [askingOwn, setAskingOwn] = useState(false);
  const asking = askingProp ?? askingOwn;
  const setAsking = onAskingChange ?? setAskingOwn;
  const approved = (designs ?? []).filter((design) => design.status === "APPROVED");
  const offered = allowed && project.status === "ACTIVE";
  const current = currentQuoteRequest(requests.data);
  const open = openQuoteRequest(requests.data);
  const locked = designs === undefined || approved.length === 0;
  const dialog = offered ? (
    <ProjectQuoteDialog
      project={project}
      designs={approved}
      current={open}
      open={asking}
      onOpenChange={setAsking}
    />
  ) : null;
  // Nothing to ask over yet and nothing asked: the page's steps say what comes first (sf-12).
  if (!current && (!offered || locked)) return null;
  // Nothing asked yet on a page whose steps hold the ask: no second "Yêu cầu báo giá" card, only
  // the dialog those steps open.
  if (!current && onAskingChange) return dialog;
  return (
    <section
      aria-labelledby="project-quote-title"
      className="bg-bg-surface border-border-default grid gap-3 rounded-[var(--r-lg)] border p-[var(--card-pad)] shadow-[var(--card-shadow)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="project-quote-title" className="text-ink-primary text-base font-semibold">
            Báo giá cả dự án
          </h2>
          <p className="text-ink-secondary text-sm">
            Một yêu cầu cho nhiều bản đã duyệt, với một ngày giao chung. Sale lập một báo giá cho cả
            bộ.
          </p>
        </div>
        {offered && !locked ? (
          // An open request is changed by a new ask, never doubled (as on a design's card).
          <Button
            type="button"
            variant="outline"
            className={ACTION_BUTTON}
            onClick={() => setAsking(true)}
          >
            {open ? "Sửa yêu cầu báo giá cả dự án" : "Yêu cầu báo giá cả dự án"}
          </Button>
        ) : null}
      </div>
      {requests.isPending ? (
        <Skeleton className="h-16 w-full rounded-[var(--r-md)]" />
      ) : requests.isError ? (
        <div className="text-ink-secondary flex flex-wrap items-center gap-2 text-sm">
          <span>Chưa tải được yêu cầu báo giá của dự án.</span>
          <Button
            type="button"
            variant="ghost"
            className={cn(ACTION_BUTTON, "px-3")}
            disabled={requests.isFetching}
            onClick={() => void requests.refetch()}
          >
            <RotateCw aria-hidden className="size-4" />
            Thử lại
          </Button>
        </div>
      ) : current ? (
        <ProjectQuoteFacts request={current} />
      ) : (
        <p className="text-ink-tertiary text-sm">Dự án chưa có yêu cầu báo giá nào.</p>
      )}
      {dialog}
    </section>
  );
}
