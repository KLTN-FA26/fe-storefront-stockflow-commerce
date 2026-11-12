"use client";

import { useCallback, useState } from "react";

/** What the studio says in its live region (spec §6.4), word for word. */
export const STUDIO_ANNOUNCEMENTS = {
  imageAdded: "Đã thêm ảnh",
  textAdded: "Đã thêm chữ",
  drawingAdded: "Đã thêm lớp nét vẽ",
  backgroundAppliedToAll: "Đã áp dụng nền cho mọi mặt",
  elementRemoved: "Đã xoá phần tử",
  copiedTo: (face: string) => `Đã sao chép sang ${face}`,
  saved: "Đã lưu",
  submitted: "Đã gửi duyệt",
  revisionCreated: "Đã tạo bản sửa",
} as const;

type Announcement = { text: string; id: number };
/** The latest routine message, and the latest urgent one (an error the user must hear). */
type Announcements = { polite: Announcement | null; urgent: Announcement | null };

/** `announce(message)` for `StudioServices`, and the latest announcements for `StudioAnnouncer`. */
export function useStudioAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcements>({ polite: null, urgent: null });
  const announce = useCallback((text: string, options?: { urgent?: boolean }) => {
    const key = options?.urgent ? "urgent" : "polite";
    setAnnouncement((prev) => ({ ...prev, [key]: { text, id: (prev[key]?.id ?? 0) + 1 } }));
  }, []);
  return { announcement, announce };
}

/**
 * The studio's live regions: a polite one for routine news ("Đã lưu") and an assertive one for
 * errors, so a later "Đã lưu" cannot replace an error before it is read. Each announcement is a
 * new node (keyed by its id), so the same words said twice are read twice. The assertive region
 * is not `role="alert"`, so it never doubles an alert the screen itself shows.
 */
export function StudioAnnouncer({ announcement }: { announcement: Announcements }) {
  const { polite, urgent } = announcement;
  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite ? <span key={polite.id}>{polite.text}</span> : null}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {urgent ? <span key={urgent.id}>{urgent.text}</span> : null}
      </div>
    </>
  );
}
