"use client";

import Image from "next/image";
import Link from "next/link";
import { Copy, Eye, FilePen, MessageCircle, MoreHorizontal, Palette, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { CHAT_WITH_SALES, STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHasPermission } from "@/lib/auth/my-permissions";
import { PERM } from "@/lib/auth/permission-codes";
import { isRemoteImage } from "@/lib/remote-image";

import { allowedActions, isReturned } from "../lifecycle";
import { designCardView } from "../selectors";
import { mayHaveQuoteRequest } from "../quote-request-rules";
import type { Design } from "../types";
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
    <span className="text-ink-tertiary flex h-24 flex-col items-center justify-center gap-1 text-xs">
      <Palette className="size-6" aria-hidden="true" />
      Chưa có bản xem trước
    </span>
  );
}

const ACTION_CLASS = "min-h-11 rounded-[var(--r-md)] px-4";
/** A menu row: 40px tall, with shadcn's neutral highlight (the project's `accent` token is the brand blue). */
const MENU_ITEM = "focus:bg-bg-muted focus:text-ink-primary min-h-10 px-2.5";

type DesignCardProps = {
  design: Design;
  /** "Xoá"; the button is left out without it. */
  onDelete?: (design: Design) => void;
  /** "Tạo bản sửa"; the button is left out without it. */
  onRevise?: (design: Design) => void;
  /** "Nhân bản sang quy cách khác"; the button is left out without it. */
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
  const quoteOffered =
    useHasPermission(PERM.designQuoteRequest) && actions.includes("requestQuote");
  const mayChat = useHasPermission(PERM.chatCreate);
  return (
    <article className="bg-bg-surface border-border-default flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-shadow duration-200 hover:shadow-[var(--sh-md)]">
      {/* A design with a preview shows it large; one without gets a short band, not a grey 4:3 box with an icon. */}
      <div
        className={
          previewUrl
            ? "bg-bg-subtle relative aspect-[4/3] overflow-hidden"
            : "bg-bg-subtle relative overflow-hidden"
        }
      >
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
        {/* One primary button per status (SF-UX-7): "Yêu cầu báo giá" on an approved design (the WF-02 next step),
            else "Tiếp tục thiết kế" on a draft, else "Xem". Everything else sits in the "more" menu beside it. */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          {quoteOffered ? (
            <RequestQuoteButton design={design} />
          ) : actions.includes("edit") ? (
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="ml-auto size-11 rounded-full p-0"
                aria-label={`Thao tác khác với ${title}`}
              >
                <MoreHorizontal aria-hidden className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52">
              {quoteOffered ? (
                <DropdownMenuItem asChild className={MENU_ITEM}>
                  <Link
                    href={href}
                    aria-label={`${actions.includes("edit") ? "Tiếp tục thiết kế" : "Xem"} ${title}`}
                  >
                    <Eye aria-hidden />
                    {actions.includes("edit") ? "Tiếp tục thiết kế" : "Xem"}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {onRevise && actions.includes("createRevision") ? (
                <DropdownMenuItem
                  className={MENU_ITEM}
                  disabled={reviseDisabled}
                  aria-label={`Tạo bản sửa ${title}`}
                  onSelect={() => onRevise(design)}
                >
                  <FilePen aria-hidden />
                  {revising ? "Đang tạo..." : "Tạo bản sửa"}
                </DropdownMenuItem>
              ) : null}
              {onClone ? (
                <DropdownMenuItem
                  className={MENU_ITEM}
                  aria-label={`Nhân bản ${title} sang quy cách khác`}
                  onSelect={() => onClone(design)}
                >
                  <Copy aria-hidden />
                  Nhân bản sang quy cách khác
                </DropdownMenuItem>
              ) : null}
              {/* Any design can be talked over in chat (PO 2026-11-22, Q7: as the BE — Sale sees its
                  name and status, never a draft's content). */}
              {mayChat ? (
                <DropdownMenuItem asChild className={MENU_ITEM}>
                  <Link
                    href={STORE_ROUTES.chat.about("DESIGN", design.id)}
                    aria-label={`${CHAT_WITH_SALES} về ${title}`}
                  >
                    <MessageCircle aria-hidden />
                    {CHAT_WITH_SALES}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {onDelete && actions.includes("delete") ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    className="min-h-10 px-2.5"
                    aria-label={`Xoá ${title}`}
                    onSelect={() => onDelete(design)}
                  >
                    <Trash2 aria-hidden />
                    Xoá
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          {extraActions}
        </div>
      </div>
    </article>
  );
}
