"use client";

import { useState } from "react";

import { describeBeRefusal } from "@/lib/api/describe-error";

import type { ChatDownloadLink } from "../types";

/**
 * Opens a short-lived download link (C7, the contract document) in a new tab. The tab is opened in
 * the click's own turn, so the browser lets it through, and pointed at the link once it arrives;
 * without a tab (blocked), the link is offered to click instead.
 */
export function useOpenLink() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  const open = (key: string, fetchLink: () => Promise<ChatDownloadLink>) => {
    const tab = typeof window.open === "function" ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    setBusy(key);
    setError(null);
    setFallback(null);
    fetchLink()
      .then((link) => {
        if (tab) tab.location.replace(link.url);
        else setFallback(link.url);
      })
      .catch((failure: unknown) => {
        tab?.close();
        setError(describeBeRefusal(failure));
      })
      .finally(() => setBusy(null));
  };

  return { open, busy, error, fallback };
}
