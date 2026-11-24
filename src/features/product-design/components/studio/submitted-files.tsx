"use client";

import { Download, ExternalLink, FileText, RotateCw } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatFileSize } from "@/lib/format";

import { getArtifactDownloadUrl } from "../../api";
import { describeFileDownloadError } from "../../errors";
import { useDesignFiles } from "../../queries";
import type { DesignFile } from "../../types";

/** What each file of the bundle is to the customer, in the order the list shows them. */
const FILE_LABELS: Record<DesignFile["role"], string> = {
  CUSTOMER_PREVIEW: "Ảnh xem trước",
  PRINT_READY: "File in (PDF)",
  TECHNICAL_SPEC: "Mô tả thiết kế (PDF)",
  PRODUCTION_INSTRUCTION: "Hướng dẫn sản xuất",
};

/** The first 8 hex digits of a checksum: enough to tell two files apart at a glance. */
const shortChecksum = (sha256: string) => sha256.slice(0, 8);

/** A link the browser would not open as a tab: the customer opens it with a click of their own. */
type Ready = { url: string; label: string };

/**
 * "File đã gửi": the newest file of each role of the design (the preview, print file and technical
 * spec the browser rendered when it was sent; once approved, the frozen files, the stamped print
 * file and the production instruction among them), each with its size and checksum. Nothing while
 * the files are read, and nothing for a design never sent; a list that cannot be read says so, with
 * "Thử lại". The list is read again each time it opens.
 *
 * A file's link lives 10 minutes, so it is asked for when the customer asks for that file. The tab
 * is opened in the click itself, before the link is asked for, and sent to the link once it comes
 * (Flows M-2): a tab opened after an await is a popup Safari blocks. Should the browser refuse even
 * that, the link shows as a real one to click. A file the BE refuses to hand out (an approved file
 * that no longer passes its integrity check) says so, and the tab is closed.
 */
export function SubmittedFiles({
  designId,
  approved = false,
}: {
  designId: string;
  approved?: boolean;
}) {
  const files = useDesignFiles(designId, true, approved);
  const [opening, setOpening] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);

  if (files.isError && !files.data) {
    return (
      <div className="flex items-center gap-2">
        <p role="alert" className="text-danger text-sm">
          Chưa tải được danh sách file đã gửi.
        </p>
        <Button
          variant="outline"
          className="min-h-11 rounded-[var(--r-md)] px-3"
          disabled={files.isFetching}
          onClick={() => void files.refetch()}
        >
          <RotateCw aria-hidden className="size-4" />
          <span className="ml-1.5">Thử lại</span>
        </Button>
      </div>
    );
  }
  if (!files.data?.length) return null;

  function open(file: DesignFile) {
    // In the click's own turn: the browser lets this tab open. No `noopener` here, or there is no
    // handle to send it on; the opener is cut by hand instead.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setOpening(file.artifactId);
    setRefusal(null);
    setReady(null);
    void getArtifactDownloadUrl(designId, file.artifactId)
      .then((link) => {
        if (tab) tab.location.replace(link.url);
        else setReady({ url: link.url, label: FILE_LABELS[file.role] });
      })
      .catch((error: unknown) => {
        tab?.close();
        setRefusal(describeFileDownloadError(error));
      })
      .finally(() => setOpening(null));
  }

  return (
    <Popover
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setRefusal(null);
          setReady(null);
          void files.refetch();
        }
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
            <li key={file.artifactId}>
              <button
                type="button"
                onClick={() => open(file)}
                disabled={opening !== null}
                className="hover:bg-bg-subtle focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] px-2 py-1.5 text-left outline-none focus-visible:ring-3 disabled:opacity-60"
              >
                <Download aria-hidden className="text-ink-tertiary size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{FILE_LABELS[file.role]}</span>
                  <span className="text-ink-tertiary block text-xs tabular-nums">
                    {formatFileSize(file.sizeBytes)} ·{" "}
                    <span className="font-mono">{shortChecksum(file.sha256)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {ready ? (
          <Button asChild variant="outline" className="min-h-11 rounded-[var(--r-md)] px-3">
            <a href={ready.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden className="size-4" />
              <span className="ml-1.5">Mở {ready.label}</span>
            </a>
          </Button>
        ) : null}
        {refusal ? (
          <div role="alert">
            <Alert tone="danger">{refusal}</Alert>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
