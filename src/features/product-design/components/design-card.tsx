"use client";

import Image from "next/image";
import Link from "next/link";
import { Palette } from "lucide-react";
import type { ReactNode } from "react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { isRemoteImage } from "@/lib/remote-image";

import { allowedActions, isReturned } from "../lifecycle";
import { designCardView } from "../selectors";
import { mayHaveQuoteRequest } from "../quote-request-rules";
import type { Design } from "../types";
import { ChatAboutButton } from "./chat-about-button";
import { DesignQuoteSummary, RequestQuoteButton } from "./design-quote-request";
import { DesignStatusBadge } from "./design-status-badge";

/** The preview image of a design, or a placeholder when it has none yet. */
function Thumbnail({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized={isRemoteImage(src) || src.startsWith("blob:")}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain p-4"
      />
    );
  }
  return (
    <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center">
      <Palette className="size-8" aria-hidden="true" />
      <span className="sr-only">Chưa có bản xem trước</span>
    </span>
  );
}

const ACTION_CLASS = "min-h-11 rounded-[var(--r-md)] px-4";

type DesignCardProps = {
  design: Design;
  /** "Xoá"; the button is left out without it. */
  onDelete?: (design: Design) => void;
  /** "Tạo bản sửa"; the button is left out without it. */
  onRevise?: (design: Design) => void;
  /** "Nhân bản sang cỡ khác"; the button is left out without it. */
  onClone?: (design: Design) => void;
  /** A revision of this design is being created. */
  revising?: boolean;
  /** A revision (of this design or another) is being created: "Tạo bản sửa" waits for it. */
  reviseDisabled?: boolean;
  /** Left out of the project page, where every card is of that project anyway. */
  hideProject?: boolean;
  /** Over the preview's top-left corner (the project page's check box). */
  selection?: ReactNode;
  /** More buttons, after the card's own (the project page's "Xem 3D", "Gỡ khỏi dự án"). */
  extraActions?: ReactNode;
  /** Short lines under the title (why a button is locked). */
  notes?: ReactNode;
};

/**
 * One design: preview, status, what it is for, when it changed, its quote request (WF-02 D1), and
 * what its status allows.
 */
export function DesignCard({
  design,
  onDelete,
  onRevise,
  onClone,
  revising = false,
  reviseDisabled = revising,
  hideProject = false,
  selection,
  extraActions,
  notes,
}: DesignCardProps) {
  const { title, subtitle, updatedLabel, status, returnReason, previewUrl } =
    designCardView(design);
  const actions = allowedActions(design);
  const href = STORE_ROUTES.design.detail(design.id);
  return (
    <article className="bg-bg-surface border-border-default flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-shadow duration-200 hover:shadow-[var(--sh-md)]">
      <div className="bg-bg-subtle relative aspect-[4/3] overflow-hidden">
        <Thumbnail src={previewUrl} alt={`Bản xem trước ${title}`} />
        {selection ? <div className="absolute top-1 left-1">{selection}</div> : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-[var(--card-pad)]">
        <div className="space-y-2">
          <DesignStatusBadge status={status} returned={isReturned(design)} />
          <h2 className="text-ink-primary line-clamp-2 text-base font-semibold">{title}</h2>
          <p className="text-ink-tertiary text-xs break-words">{subtitle}</p>
          {design.customerSku ? (
            <p className="text-ink-secondary text-xs break-all">
              {"SKU riêng "}
              <span className="font-mono">{design.customerSku}</span>
            </p>
          ) : null}
          {design.project && !hideProject ? (
            <p className="bg-bg-muted text-ink-secondary inline-block max-w-full truncate rounded-full px-3 py-1 text-xs font-medium">
              {`Dự án: ${design.project.name}`}
            </p>
          ) : null}
          {updatedLabel ? (
            <p className="text-ink-secondary text-sm tabular-nums">Cập nhật {updatedLabel}</p>
          ) : null}
          {returnReason ? (
            <p className="text-ink-secondary line-clamp-3 text-sm">Lý do trả lại: {returnReason}</p>
          ) : null}
          {notes}
          {mayHaveQuoteRequest(design) ? <DesignQuoteSummary design={design} /> : null}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          {actions.includes("edit") ? (
            <Button asChild className={ACTION_CLASS}>
              <Link href={href} aria-label={`Tiếp tục thiết kế ${title}`}>
                Tiếp tục thiết kế
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" className={ACTION_CLASS}>
              <Link href={href} aria-label={`Xem ${title}`}>
                Xem
              </Link>
            </Button>
          )}
          {onRevise && actions.includes("createRevision") ? (
            <Button
              type="button"
              className={ACTION_CLASS}
              disabled={reviseDisabled}
              aria-label={`Tạo bản sửa ${title}`}
              onClick={() => onRevise(design)}
            >
              {revising ? "Đang tạo..." : "Tạo bản sửa"}
            </Button>
          ) : null}
          {actions.includes("requestQuote") ? <RequestQuoteButton design={design} /> : null}
          {/* Any design can be talked over in chat (PO 2026-11-22, Q7: as the BE — Sale sees its
              name and status, never a draft's content). */}
          <ChatAboutButton kind="DESIGN" id={design.id} name={title} />
          {onClone ? (
            <Button
              type="button"
              variant="outline"
              className={ACTION_CLASS}
              aria-label={`Nhân bản ${title} sang cỡ khác`}
              onClick={() => onClone(design)}
            >
              Nhân bản sang cỡ khác
            </Button>
          ) : null}
          {onDelete && actions.includes("delete") ? (
            <Button
              type="button"
              variant="ghost"
              className={ACTION_CLASS}
              aria-label={`Xoá ${title}`}
              onClick={() => onDelete(design)}
            >
              Xoá
            </Button>
          ) : null}
          {extraActions}
        </div>
      </div>
    </article>
  );
}
