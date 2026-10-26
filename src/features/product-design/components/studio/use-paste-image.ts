"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

import { firstFile } from "./use-asset-upload";

/**
 * Hands `onFile` the file a paste carries (a screenshot, an image copied in a browser, a file
 * copied in the file manager). Heard on `stage` only, never on the whole page, so pasting text into
 * a field elsewhere is left alone; a paste without a file is left alone too. `onFile` is `null`
 * while nothing may be added (a read-only design).
 */
export function usePasteImage(
  stage: RefObject<HTMLElement | null>,
  onFile: ((file: File) => void) | null,
) {
  const handle = useEffectEvent((event: ClipboardEvent) => {
    const file = firstFile(event.clipboardData?.files);
    if (!file || !onFile) return;
    event.preventDefault();
    onFile(file);
  });

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const listener = (event: ClipboardEvent) => handle(event);
    element.addEventListener("paste", listener);
    return () => element.removeEventListener("paste", listener);
  }, [stage]);
}
