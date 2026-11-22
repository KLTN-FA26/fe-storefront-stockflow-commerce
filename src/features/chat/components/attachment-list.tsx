"use client";

import { FileText, ImageIcon } from "lucide-react";

import { formatFileSize } from "@/lib/format/number";

import { getAttachmentLink } from "../api";
import type { ChatAttachment } from "../types";
import { AttachmentImage } from "./attachment-image";
import { useOpenLink } from "./use-open-link";

/** A message's files; each opens through a 10-minute link (C7). */
export function AttachmentList({
  conversationId,
  attachments,
}: {
  conversationId: string;
  attachments: ChatAttachment[];
}) {
  const download = useOpenLink();
  if (attachments.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      <ul className="space-y-1.5">
        {attachments.map((file) => {
          const isImage = Boolean(file.contentType?.startsWith("image/"));
          const Icon = isImage ? ImageIcon : FileText;
          const name = file.fileName ?? "Tệp đính kèm";
          const row = (
            <button
              type="button"
              onClick={() =>
                download.open(file.id, () => getAttachmentLink(conversationId, file.id))
              }
              disabled={download.busy === file.id}
              aria-label={`Tải ${name}`}
              className="focus-visible:ring-accent flex min-h-11 w-full items-center gap-2 rounded-[var(--r-md)] border border-current/30 px-2.5 text-left text-sm hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
              {file.sizeBytes ? (
                <span className="shrink-0 text-xs tabular-nums opacity-80">
                  {formatFileSize(file.sizeBytes)}
                </span>
              ) : null}
            </button>
          );
          return (
            <li key={file.id}>
              {isImage ? (
                <AttachmentImage conversationId={conversationId} file={file} fallback={row} />
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      {download.error ? (
        <p role="alert" className="text-xs">
          {download.error}
        </p>
      ) : null}
      {download.fallback ? (
        <a
          href={download.fallback}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs underline"
        >
          Mở file
        </a>
      ) : null}
    </div>
  );
}
