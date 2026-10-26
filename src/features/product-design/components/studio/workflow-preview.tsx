"use client";

import { Palette } from "lucide-react";
import Image from "next/image";

import { Skeleton } from "@/components/shared";
import { isRemoteImage } from "@/lib/remote-image";

import { useDesignArtifacts, useDownloadLink } from "../../queries";
import type { DesignDraft } from "../../types";

/**
 * The artifact the customer is shown: P6's `previewArtifactId`, else the newest CUSTOMER_PREVIEW of
 * `GET /designs/{id}/artifacts` (the real BE sends no P6 fields).
 */
function usePreviewArtifactId(design: DesignDraft) {
  const artifacts = useDesignArtifacts(design.id);
  if (design.previewArtifactId) return { id: design.previewArtifactId, pending: false };
  // An artifact's role is the file's purpose (preview, print, spec), not a user's role.
  const previews = artifacts.data?.filter(({ role: purpose }) => purpose === "CUSTOMER_PREVIEW");
  const newest = previews?.toSorted((a, b) => Date.parse(b.storedAt) - Date.parse(a.storedAt))[0];
  return { id: newest?.artifactId ?? null, pending: artifacts.isPending };
}

/** The design's customer preview, with the colour disclaimer every preview carries. */
export function WorkflowPreview({ design }: { design: DesignDraft }) {
  const preview = usePreviewArtifactId(design);
  const link = useDownloadLink("artifact", design.id, preview.id, true);
  const src = link.data?.url;

  return (
    <figure className="flex flex-col gap-2">
      <div className="bg-bg-subtle border-border-default relative aspect-square overflow-hidden rounded-[var(--r-lg)] border">
        {src ? (
          <Image
            src={src}
            alt={`Bản xem trước ${design.name}`}
            fill
            unoptimized={isRemoteImage(src)}
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-contain p-4"
          />
        ) : preview.pending || (preview.id && link.isPending) ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : (
          <span className="text-ink-tertiary absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
            <Palette aria-hidden className="size-8" />
            Chưa có bản xem trước
          </span>
        )}
      </div>
      <figcaption className="text-ink-tertiary text-xs">
        Màu sắc hiển thị có thể sai lệch so với thành phẩm in thật
      </figcaption>
    </figure>
  );
}
