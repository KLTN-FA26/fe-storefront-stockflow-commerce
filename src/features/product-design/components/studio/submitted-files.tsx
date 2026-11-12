"use client";

import { Download, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFileSize } from "@/lib/format";

import { useDesignFiles } from "../../queries";
import type { DesignFile } from "../../types";

/** What each file of the bundle is to the customer, in the order the bundle lists them. */
const FILE_LABELS: Record<DesignFile["role"], string> = {
  CUSTOMER_PREVIEW: "Ảnh xem trước",
  PRINT_READY: "File in (PDF)",
  TECHNICAL_SPEC: "Đặc tả kỹ thuật (PDF)",
};

/** The first 8 hex digits of a checksum: enough to tell two files apart at a glance. */
const shortChecksum = (sha256: string) => sha256.slice(0, 8);

/**
 * "File đã gửi": the bundle the browser rendered when the design was submitted (spec §3 output:
 * preview, print file, technical spec), each to download with its size and checksum. Nothing until
 * the files are read, and nothing for a design never sent. The list is read again each time it
 * opens, so its short-lived links are fresh; a link opens in a new tab, as a signed link on
 * another origin ignores `download` (the BE names the file itself, spec §4.5).
 */
export function SubmittedFiles({ designId }: { designId: string }) {
  const files = useDesignFiles(designId, true);
  if (!files.data?.length) return null;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) void files.refetch();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-h-11 rounded-[var(--r-md)] px-3">
          <FileText aria-hidden className="size-4" />
          <span className="ml-1.5">File đã gửi</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="bg-bg-surface text-ink-primary border-border-default w-80 gap-1 p-2"
      >
        <ul className="grid gap-1">
          {files.data.map((file) => (
            <li key={file.role}>
              <a
                href={file.url}
                download={file.name}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-bg-muted focus-visible:ring-ring/50 flex min-h-11 items-center gap-3 rounded-[var(--r-md)] px-2 py-1.5 outline-none focus-visible:ring-3"
              >
                <Download aria-hidden className="text-ink-tertiary size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{FILE_LABELS[file.role]}</span>
                  <span className="text-ink-tertiary block text-xs tabular-nums">
                    {formatFileSize(file.sizeBytes)} ·{" "}
                    <span className="font-mono">{shortChecksum(file.sha256)}</span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
