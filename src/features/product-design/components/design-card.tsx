"use client";

import Image from "next/image";
import Link from "next/link";
import { Palette } from "lucide-react";

import { STORE_ROUTES } from "@/constants";
import { Skeleton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { isRemoteImage } from "@/lib/remote-image";

import { useDownloadLink } from "../queries";
import { designCardView } from "../selectors";
import type { DesignDraft } from "../types";
import { DesignStatusBadge } from "./design-status-badge";

/** The preview image of a design; a presigned link is read once per card and cached until it expires. */
function Thumbnail({ draft, alt }: { draft: DesignDraft; alt: string }) {
  const link = useDownloadLink("artifact", draft.id, draft.previewArtifactId, true);
  const src = link.data?.url;
  if (src) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized={isRemoteImage(src)}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-contain p-4"
      />
    );
  }
  if (draft.previewArtifactId && link.isPending) {
    return <Skeleton className="absolute inset-0 rounded-none" />;
  }
  return (
    <span className="text-ink-tertiary absolute inset-0 flex items-center justify-center">
      <Palette className="size-8" aria-hidden="true" />
      <span className="sr-only">Chưa có bản xem trước</span>
    </span>
  );
}

/** One design: preview, status, what it is for, when it changed. The whole card opens the studio. */
export function DesignCard({ draft }: { draft: DesignDraft }) {
  const { title, subtitle, updatedLabel, state } = designCardView(draft);
  return (
    <article className="group bg-bg-surface border-border-default hover:border-border-strong focus-within:ring-accent relative flex h-full flex-col overflow-hidden rounded-[var(--r-lg)] border shadow-[var(--card-shadow)] transition-[border-color,box-shadow] duration-200 focus-within:ring-2 hover:shadow-[var(--sh-md)]">
      <div className="bg-bg-subtle relative aspect-[4/3] overflow-hidden">
        <Thumbnail draft={draft} alt={`Bản xem trước ${title}`} />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-[var(--card-pad)]">
        <div className="space-y-2">
          <DesignStatusBadge state={state} />
          <h2 className="text-ink-primary line-clamp-2 text-base font-semibold">{title}</h2>
          {subtitle ? (
            <p className="text-ink-tertiary font-mono text-xs break-all">{subtitle}</p>
          ) : null}
          {updatedLabel ? (
            <p className="text-ink-secondary text-sm tabular-nums">Cập nhật {updatedLabel}</p>
          ) : null}
        </div>
        <Button
          asChild
          variant="outline"
          className="mt-auto min-h-11 rounded-[var(--r-md)] px-4 after:absolute after:inset-0 after:rounded-[var(--r-lg)]"
        >
          <Link href={STORE_ROUTES.design.detail(draft.id)} aria-label={`Mở thiết kế ${title}`}>
            Mở thiết kế
          </Link>
        </Button>
      </div>
    </article>
  );
}
