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
  reviewRequested: "Đã gửi QC kiểm tra",
  finalized: "Đã chốt thiết kế",
  confirmed: "Đã xác nhận thiết kế",
  snapshotCopied: "Đã sao chép mã bản chốt",
  snapshotSelected: "Không sao chép được. Mã đã được chọn để bạn sao chép.",
  preflight: (fails: number, warnings: number) => `Kiểm tra: ${fails} lỗi, ${warnings} cảnh báo`,
} as const;

type Announcement = { text: string; id: number };

/** `announce(message)` for `StudioServices`, and the latest announcement for `StudioAnnouncer`. */
export function useStudioAnnouncer() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const announce = useCallback((text: string) => {
    setAnnouncement((prev) => ({ text, id: (prev?.id ?? 0) + 1 }));
  }, []);
  return { announcement, announce };
}

/**
 * The studio's one polite live region. Each announcement is a new node (keyed by its id), so the
 * same words said twice are read twice.
 */
export function StudioAnnouncer({ announcement }: { announcement: Announcement | null }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement ? <span key={announcement.id}>{announcement.text}</span> : null}
    </div>
  );
}
