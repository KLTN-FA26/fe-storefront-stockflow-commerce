"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useAttachmentLink } from "../queries";
import type { ChatAttachment } from "../types";

interface AttachmentImageProps {
  conversationId: string;
  file: ChatAttachment;
  /** Shown instead of the thumbnail while there is no link to draw (or it failed): the plain file row. */
  fallback: ReactNode;
}

/**
 * An image attachment as a thumbnail drawn from its 10-minute link (C7); a click opens it large
 * with a download button. No link (error, still loading) keeps the plain file row.
 */
export function AttachmentImage({ conversationId, file, fallback }: AttachmentImageProps) {
  const [open, setOpen] = useState(false);
  const link = useAttachmentLink(conversationId, file.id);
  const name = file.fileName ?? "Ảnh đính kèm";
  const url = link.data?.url;
  if (!url) return <>{fallback}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Xem ảnh ${name}`}
        className="focus-visible:ring-accent relative block size-28 overflow-hidden rounded-[var(--r-md)] border border-current/30 focus-visible:ring-2 focus-visible:outline-none"
      >
        {/* The link is a short-lived presigned URL on another host: nothing to optimise or cache. */}
        <Image src={url} alt={name} fill unoptimized loading="lazy" className="object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border-default bg-bg-surface rounded-[var(--r-xl)] border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-ink-primary truncate">{name}</DialogTitle>
            <DialogDescription className="sr-only">Xem ảnh đính kèm</DialogDescription>
          </DialogHeader>
          <div className="relative h-[60dvh] w-full">
            <Image src={url} alt={name} fill unoptimized className="object-contain" />
          </div>
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-4">
            <a href={url} target="_blank" rel="noopener noreferrer" download={name}>
              <Download aria-hidden className="size-4" />
              Tải ảnh
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
