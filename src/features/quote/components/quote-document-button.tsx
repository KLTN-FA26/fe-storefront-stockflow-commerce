"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";

import { getQuoteDocument } from "../api";
import { describeQuoteError } from "../errors";

/** How long the PDF's object URL lives once handed to the new tab. */
const OBJECT_URL_TTL_MS = 60_000;

/**
 * "Tải PDF": GET /quotes/{id}/document is the PDF itself, opened in a new tab. The tab is opened in
 * the click's own turn (so the browser allows it) and pointed at the file once it arrived; without
 * a tab the file is downloaded instead.
 */
export function QuoteDocumentButton({
  quoteId,
  quoteNumber,
}: {
  quoteId: string;
  quoteNumber: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    getQuoteDocument(quoteId)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.replace(url);
        else {
          const link = document.createElement("a");
          link.href = url;
          link.download = `${quoteNumber}.pdf`;
          link.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
      })
      .catch((failure: unknown) => {
        tab?.close();
        setError(describeQuoteError(failure));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className="min-h-11 rounded-[var(--r-md)] px-4"
        disabled={busy}
        onClick={open}
        aria-label={`Tải PDF báo giá ${quoteNumber}`}
      >
        <FileDown aria-hidden className="mr-2 size-4" />
        {busy ? "Đang tải..." : "Tải PDF"}
      </Button>
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
