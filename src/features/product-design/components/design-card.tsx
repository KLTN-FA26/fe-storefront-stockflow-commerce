"use client";

import Image from "next/image";
import Link from "next/link";
import { Palette } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Button } from "@/components/ui/button";
import { isRemoteImage } from "@/lib/remote-image";

import { allowedActions, isReturned } from "../lifecycle";
import { designCardView } from "../selectors";
import type { Design } from "../types";
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
  onDelete: (design: Design) => void;
  onRevise: (design: Design) => void;
  /** A revision of this design is being created. */
  revising?: boolean;
};

/** One design: preview, status, what it is for, when it changed, and what its status allows. */
export function DesignCard({ design, onDelete, onRevise, revising = false }: DesignCardProps) {
  const { title, subtitle, updatedLabel, status, returnReason, previewUrl } =
    designCardView(design);
  const actions = allowedActions(design);
  const href = STORE_ROUTES.design.detail(design.id);
  return (
    <article className="bg-bg-surface border-border-default flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-shadow duration-200 hover:shadow-[var(--sh-md)]">
      <div className="bg-bg-subtle relative aspect-[4/3] overflow-hidden">
        <Thumbnail src={previewUrl} alt={`Bản xem trước ${title}`} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-[var(--card-pad)]">
        <div className="space-y-2">
          <DesignStatusBadge status={status} returned={isReturned(design)} />
          <h2 className="text-ink-primary line-clamp-2 text-base font-semibold">{title}</h2>
          <p className="text-ink-tertiary text-xs break-words">{subtitle}</p>
          {updatedLabel ? (
            <p className="text-ink-secondary text-sm tabular-nums">Cập nhật {updatedLabel}</p>
          ) : null}
          {returnReason ? (
            <p className="text-ink-secondary line-clamp-3 text-sm">Lý do trả lại: {returnReason}</p>
          ) : null}
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
          {actions.includes("createRevision") ? (
            <Button
              type="button"
              className={ACTION_CLASS}
              disabled={revising}
              aria-label={`Tạo bản sửa ${title}`}
              onClick={() => onRevise(design)}
            >
              {revising ? "Đang tạo..." : "Tạo bản sửa"}
            </Button>
          ) : null}
          {actions.includes("delete") ? (
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
        </div>
      </div>
    </article>
  );
}
