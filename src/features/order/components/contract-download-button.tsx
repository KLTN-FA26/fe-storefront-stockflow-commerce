"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeApiError } from "@/lib/api/describe-error";
import { cn } from "@/lib/cn";

import { getMyOrderContractDocument } from "../contract-api";

/**
 * Opens the contract's file in a new tab: the signed copy once signed, or `copy="sent"` for the PDF
 * as Sales sent it. The tab is opened in the click's own turn so the browser allows it, then pointed
 * at the short-lived link once the BE answers.
 */
export function ContractDownloadButton({
  orderId,
  contractNumber,
  copy,
  label,
  variant = "outline",
  className,
}: {
  orderId: string;
  contractNumber: string;
  copy?: "sent";
  label: string;
  variant?: "outline" | "default";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    getMyOrderContractDocument(orderId, copy)
      .then((link) => {
        if (tab) tab.location.replace(link.url);
        else window.location.assign(link.url);
      })
      .catch((failure: unknown) => {
        tab?.close();
        setError(describeApiError(failure));
      })
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={variant}
        className={cn("min-h-11 w-full rounded-[var(--r-md)] px-4", className)}
        disabled={busy}
        onClick={open}
        aria-label={`${label} ${contractNumber}`}
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
