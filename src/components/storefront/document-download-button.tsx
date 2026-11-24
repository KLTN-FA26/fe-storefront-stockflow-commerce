"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  describeDocumentError,
  saveDocument,
  type DocumentFile,
  type DocumentKind,
} from "@/lib/documents";

/**
 * Downloads one business paper the BE draws as a PDF (phiếu, biên bản, phụ lục), saved under the
 * Vietnamese name of its `Content-Disposition`. Asked only on click: a paper is drawn from the books
 * as they stand, so nothing is fetched ahead. A refusal (404 not there yet, 409 not yet allowed)
 * shows under the button in Vietnamese.
 */
export function DocumentDownloadButton({
  kind,
  load,
  label,
  ariaLabel,
  size = "default",
  className,
}: {
  kind: DocumentKind;
  load: () => Promise<DocumentFile>;
  label: string;
  ariaLabel?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    setBusy(true);
    setError(null);
    load()
      .then(saveDocument)
      .catch((failure: unknown) => setError(describeDocumentError(failure, kind)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className={cn(
          "min-h-11 rounded-[var(--r-md)] px-4",
          size === "sm" && "px-3 text-sm",
          className,
        )}
        disabled={busy}
        aria-label={ariaLabel ?? label}
        onClick={download}
      >
        <FileDown aria-hidden className="mr-2 size-4" />
        {busy ? "Đang tải..." : label}
      </Button>
      {error ? (
        <p role="alert" className="text-danger-ink text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
