"use client";

import { useCallback, useState } from "react";

import type { EditorController, Model3dRef } from "../../engine";

/** What the quiet line says while a `.glb` loads or fell back to the code-built model. */
export const MODEL3D_MESSAGES = {
  loading: "Đang tải mô hình 3D…",
  failed: "Không tải được mô hình 3D, đang dùng mẫu thay thế",
} as const;

type Model3dStatus = "loading" | "ready" | "failed";

/** One reported status, kept with the editor and file it was reported for. */
type Report = { editor: EditorController; model3d: Model3dRef | null; status: Model3dStatus };

/**
 * The line's text for the viewer's `model3d` events: `report` is the listener's callback. A status
 * counts only for the editor and file it was reported for: when either changes under a mounted
 * viewer (and the new one has no file to load, so no new event), the old line is gone, not stale.
 */
export function useModel3dStatus(editor: EditorController, model3d: Model3dRef | null) {
  const [report, setReport] = useState<Report | null>(null);
  const reportStatus = useCallback(
    (status: Model3dStatus) => setReport({ editor, model3d, status }),
    [editor, model3d],
  );
  const status = report?.editor === editor && report.model3d === model3d ? report.status : "ready";
  const message = status === "ready" ? null : MODEL3D_MESSAGES[status];
  return { message, report: reportStatus };
}

const LINE =
  "bg-bg-surface text-ink-secondary border-border-default pointer-events-none absolute right-2 bottom-2 left-2 mx-auto w-fit max-w-full rounded-[var(--r-md)] border px-2 py-1 text-center text-xs";

/**
 * A live region that is always in the card, so a screen reader hears the text put into it; the
 * visible line is drawn only while there is text, at the card's bottom edge, over no control.
 */
export function Model3dStatusLine({ message }: { message: string | null }) {
  return (
    <p role="status" className={message ? LINE : "sr-only"}>
      {message}
    </p>
  );
}
